import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(2).max(64),
  ownerEmail: z.string().email(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(64).optional(),
  ownerEmail: z.string().email().optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const clubs = await prisma.club.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { rooms: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    clubs: clubs.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      owner: c.owner,
      roomCount: c._count.rooms,
      createdAt: c.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Name and owner email required" }, { status: 400 });
  }

  const email = parsed.data.ownerEmail.toLowerCase();
  const owner = await prisma.user.findUnique({ where: { email } });
  if (!owner) {
    return NextResponse.json({ error: `No user found with email ${email}` }, { status: 404 });
  }
  if (owner.role === "ADMIN") {
    return NextResponse.json(
      { error: "Assign club ownership to a player account, not an admin" },
      { status: 400 },
    );
  }

  const existing = await prisma.club.findUnique({ where: { ownerId: owner.id } });
  if (existing) {
    return NextResponse.json(
      { error: `${email} already owns club “${existing.name}”` },
      { status: 400 },
    );
  }

  const club = await prisma.club.create({
    data: {
      name: parsed.data.name.trim(),
      ownerId: owner.id,
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(
    {
      club: {
        id: club.id,
        name: club.name,
        active: club.active,
        owner: club.owner,
        createdAt: club.createdAt,
      },
      message: `Club “${club.name}” created — ${club.owner.email} is now the club owner`,
    },
    { status: 201 },
  );
}

export async function PATCH(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid club update" }, { status: 400 });
  }

  const club = await prisma.club.findUnique({ where: { id: parsed.data.id } });
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  let ownerId = club.ownerId;
  if (parsed.data.ownerEmail) {
    const email = parsed.data.ownerEmail.toLowerCase();
    const owner = await prisma.user.findUnique({ where: { email } });
    if (!owner) {
      return NextResponse.json({ error: `No user found with email ${email}` }, { status: 404 });
    }
    if (owner.role === "ADMIN") {
      return NextResponse.json(
        { error: "Assign club ownership to a player account, not an admin" },
        { status: 400 },
      );
    }
    const other = await prisma.club.findUnique({ where: { ownerId: owner.id } });
    if (other && other.id !== club.id) {
      return NextResponse.json(
        { error: `${email} already owns another club` },
        { status: 400 },
      );
    }
    ownerId = owner.id;
  }

  const updated = await prisma.club.update({
    where: { id: club.id },
    data: {
      ownerId,
      ...(parsed.data.name != null ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    club: {
      id: updated.id,
      name: updated.name,
      active: updated.active,
      owner: updated.owner,
    },
    message: `Club “${updated.name}” updated`,
  });
}
