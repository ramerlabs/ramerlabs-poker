import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeTicket } from "@/lib/support";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const isAdmin = authResult.role === "ADMIN";
  if (!isAdmin && ticket.userId !== authResult.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ticket: {
      ...serializeTicket(ticket),
      user: ticket.user,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        body: m.body,
        isStaff: m.isStaff,
        createdAt: m.createdAt.toISOString(),
        author: {
          id: m.author.id,
          name: m.author.name,
          email: m.author.email,
        },
      })),
    },
    isAdmin,
  });
}

const patchSchema = z.object({
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"])
    .optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const isAdmin = authResult.role === "ADMIN";
  const isOwner = ticket.userId === authResult.userId;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  // Users may only close their own resolved tickets
  if (!isAdmin) {
    if (parsed.data.priority) {
      return NextResponse.json({ error: "Only staff can change priority" }, { status: 403 });
    }
    if (parsed.data.status && parsed.data.status !== "CLOSED") {
      return NextResponse.json({ error: "You can only close resolved tickets" }, { status: 403 });
    }
    if (parsed.data.status === "CLOSED" && ticket.status !== "RESOLVED") {
      return NextResponse.json({ error: "Resolve must come from support first" }, { status: 400 });
    }
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status as never } : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority as never } : {}),
    },
  });

  return NextResponse.json({ ticket: serializeTicket(updated) });
}
