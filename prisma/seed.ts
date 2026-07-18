import { PrismaClient, RoomType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";

const prisma = new PrismaClient();
const inviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ramerlabs.com" },
    update: {},
    create: {
      email: "admin@ramerlabs.com",
      name: "Admin",
      passwordHash,
      role: "ADMIN",
      creditsBalance: 5000,
      realMoneyBalance: 1000,
      currentCurrency: "USD",
    },
  });

  const demo = await prisma.user.upsert({
    where: { email: "player@ramerlabs.com" },
    update: {},
    create: {
      email: "player@ramerlabs.com",
      name: "Demo Player",
      passwordHash,
      role: "USER",
      creditsBalance: 1000,
      realMoneyBalance: 250,
      currentCurrency: "PHP",
    },
  });

  await prisma.currencyConfig.upsert({
    where: { code: "USD" },
    update: { enabled: true },
    create: {
      code: "USD",
      name: "US Dollar",
      enabled: true,
      usdtAddress: "TUSDTmockAddressRamerlabsUSD001",
      gcashMerchantId: "GCASH-USD-MOCK",
      minDeposit: 10,
      minWithdrawal: 10,
      paymentParams: { locale: "en-US", symbol: "$" },
    },
  });

  await prisma.currencyConfig.upsert({
    where: { code: "PHP" },
    update: { enabled: true },
    create: {
      code: "PHP",
      name: "Philippine Peso",
      enabled: true,
      usdtAddress: "TUSDTmockAddressRamerlabsPHP001",
      gcashMerchantId: "GCASH-PHP-MOCK",
      minDeposit: 100,
      minWithdrawal: 100,
      paymentParams: { locale: "en-PH", symbol: "₱" },
    },
  });

  const existingFree = await prisma.room.findFirst({
    where: { name: "Lobby Credits Table", type: RoomType.FREE },
  });

  if (!existingFree) {
    await prisma.room.create({
      data: {
        name: "Lobby Credits Table",
        type: RoomType.FREE,
        currency: "CREDITS",
        buyIn: 100,
        smallBlind: 1,
        bigBlind: 2,
        maxPlayers: 6,
        isPrivate: false,
        creatorId: admin.id,
      },
    });
  }

  const existingReal = await prisma.room.findFirst({
    where: { name: "VIP Cash Room", type: RoomType.REAL },
  });

  if (!existingReal) {
    await prisma.room.create({
      data: {
        name: "VIP Cash Room",
        type: RoomType.REAL,
        currency: "USD",
        buyIn: 50,
        smallBlind: 0.5,
        bigBlind: 1,
        maxPlayers: 6,
        isPrivate: true,
        inviteCode: inviteCode(),
        creatorId: admin.id,
      },
    });
  }

  console.log("Seed complete");
  console.log("Admin: admin@ramerlabs.com / password123");
  console.log("Player:", demo.email, "/ password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
