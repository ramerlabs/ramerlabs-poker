import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";

export type PlayWalletKind = "FREE" | "REAL";

export type PlayWallet = {
  /** Club table → member club wallet; otherwise system user wallet. */
  source: "club" | "system";
  kind: PlayWalletKind;
  balance: number;
  clubClientId?: string;
  clubId?: string;
};

/** Resolve which wallet funds buy-in / cash-out for a room. */
export async function resolvePlayWallet(
  room: { id: string; type: "FREE" | "REAL"; clubId: string | null },
  userId: string,
): Promise<PlayWallet> {
  const kind: PlayWalletKind = room.type === "FREE" ? "FREE" : "REAL";

  if (room.clubId) {
    const membership = await prisma.clubClient.findUnique({
      where: {
        clubId_userId: { clubId: room.clubId, userId },
      },
      select: {
        id: true,
        clubId: true,
        creditsBalance: true,
        realMoneyBalance: true,
      },
    });
    if (!membership) {
      throw new Error("You must be a member of this club to play at this table");
    }
    return {
      source: "club",
      kind,
      balance:
        kind === "FREE"
          ? toNumber(membership.creditsBalance)
          : toNumber(membership.realMoneyBalance),
      clubClientId: membership.id,
      clubId: membership.clubId,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true, realMoneyBalance: true },
  });
  if (!user) throw new Error("User not found");
  return {
    source: "system",
    kind,
    balance:
      kind === "FREE" ? toNumber(user.creditsBalance) : toNumber(user.realMoneyBalance),
  };
}

export async function debitPlayWallet(
  wallet: PlayWallet,
  userId: string,
  amount: number,
  tx: Prisma.TransactionClient = prisma,
) {
  const dec = new Prisma.Decimal(amount);
  if (wallet.source === "club" && wallet.clubClientId) {
    const field = wallet.kind === "FREE" ? "creditsBalance" : "realMoneyBalance";
    const updated = await tx.clubClient.updateMany({
      where: {
        id: wallet.clubClientId,
        [field]: { gte: dec },
      },
      data: { [field]: { decrement: dec } },
    });
    if (updated.count !== 1) throw new Error("INSUFFICIENT");
    return;
  }
  const field = wallet.kind === "FREE" ? "creditsBalance" : "realMoneyBalance";
  const updated = await tx.user.updateMany({
    where: {
      id: userId,
      [field]: { gte: dec },
    },
    data: { [field]: { decrement: dec } },
  });
  if (updated.count !== 1) throw new Error("INSUFFICIENT");
}

export async function creditPlayWallet(
  wallet: PlayWallet,
  userId: string,
  amount: number,
  tx: Prisma.TransactionClient = prisma,
) {
  const inc = new Prisma.Decimal(amount);
  if (wallet.source === "club" && wallet.clubClientId) {
    await tx.clubClient.update({
      where: { id: wallet.clubClientId },
      data:
        wallet.kind === "FREE"
          ? { creditsBalance: { increment: inc } }
          : { realMoneyBalance: { increment: inc } },
    });
    return;
  }
  await tx.user.update({
    where: { id: userId },
    data:
      wallet.kind === "FREE"
        ? { creditsBalance: { increment: inc } }
        : { realMoneyBalance: { increment: inc } },
  });
}
