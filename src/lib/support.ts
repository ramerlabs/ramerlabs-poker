import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";

export const TICKET_CATEGORIES: TicketCategory[] = [
  "ACCOUNT",
  "BILLING",
  "GAMEPLAY",
  "TECHNICAL",
  "OTHER",
];

export const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const TICKET_STATUSES: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_USER",
  "RESOLVED",
  "CLOSED",
];

export function categoryLabel(c: TicketCategory) {
  switch (c) {
    case "ACCOUNT":
      return "Account";
    case "BILLING":
      return "Billing";
    case "GAMEPLAY":
      return "Gameplay";
    case "TECHNICAL":
      return "Technical";
    default:
      return "Other";
  }
}

export function priorityLabel(p: TicketPriority) {
  switch (p) {
    case "LOW":
      return "Low";
    case "HIGH":
      return "High";
    case "URGENT":
      return "Urgent";
    default:
      return "Normal";
  }
}

export function statusLabel(s: TicketStatus) {
  switch (s) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In progress";
    case "WAITING_ON_USER":
      return "Waiting on you";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
    default:
      return s;
  }
}

export function userCanReply(status: TicketStatus) {
  return status === "OPEN" || status === "IN_PROGRESS" || status === "WAITING_ON_USER";
}

export function serializeTicket<T extends {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}>(ticket: T) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    userId: ticket.userId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
