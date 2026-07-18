import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  serializeTicket,
} from "@/lib/support";
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";

export async function GET(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");

  const where: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
  } = {};

  if (status && (TICKET_STATUSES as string[]).includes(status)) {
    where.status = status as TicketStatus;
  }
  if (priority && (TICKET_PRIORITIES as string[]).includes(priority)) {
    where.priority = priority as TicketPriority;
  }
  if (category && (TICKET_CATEGORIES as string[]).includes(category)) {
    where.category = category as TicketCategory;
  }

  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      ...serializeTicket(t),
      messageCount: t._count.messages,
      user: t.user,
    })),
  });
}
