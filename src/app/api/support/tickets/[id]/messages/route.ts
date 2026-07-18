import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { userCanReply } from "@/lib/support";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const isAdmin = authResult.role === "ADMIN";
  const isOwner = ticket.userId === authResult.userId;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (ticket.status === "CLOSED") {
    return NextResponse.json({ error: "Ticket is closed" }, { status: 400 });
  }

  if (!isAdmin && !userCanReply(ticket.status)) {
    return NextResponse.json({ error: "You can’t reply on this ticket right now" }, { status: 400 });
  }

  const message = await prisma.supportMessage.create({
    data: {
      ticketId: id,
      authorId: authResult.userId,
      body: parsed.data.body,
      isStaff: isAdmin,
    },
    include: { author: { select: { id: true, name: true, email: true } } },
  });

  let nextStatus = ticket.status;
  if (isAdmin && ticket.status === "OPEN") nextStatus = "IN_PROGRESS";
  if (isAdmin && ticket.status === "IN_PROGRESS") nextStatus = "WAITING_ON_USER";
  if (!isAdmin && ticket.status === "WAITING_ON_USER") nextStatus = "IN_PROGRESS";

  if (nextStatus !== ticket.status) {
    await prisma.supportTicket.update({
      where: { id },
      data: { status: nextStatus },
    });
  } else {
    await prisma.supportTicket.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  return NextResponse.json({
    message: {
      id: message.id,
      body: message.body,
      isStaff: message.isStaff,
      createdAt: message.createdAt.toISOString(),
      author: message.author,
    },
    status: nextStatus,
  });
}
