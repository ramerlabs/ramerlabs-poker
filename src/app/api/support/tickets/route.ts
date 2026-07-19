import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeTicket } from "@/lib/support";

const createSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(5).max(5000),
  category: z.enum(["ACCOUNT", "BILLING", "GAMEPLAY", "TECHNICAL", "OTHER"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: authResult.userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      ...serializeTicket(t),
      messageCount: t._count.messages,
      preview: t.messages[0]?.body?.slice(0, 140) ?? "",
    })),
  });
}

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ticket" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: authResult.userId,
      subject: parsed.data.subject,
      category: parsed.data.category as never,
      priority: parsed.data.priority as never,
      messages: {
        create: {
          authorId: authResult.userId,
          body: parsed.data.body,
          isStaff: false,
        },
      },
    },
  });

  return NextResponse.json({ ticket: serializeTicket(ticket) }, { status: 201 });
}
