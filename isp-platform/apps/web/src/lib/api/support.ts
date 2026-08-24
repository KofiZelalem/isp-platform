import "server-only";

import { prisma } from "@/lib/db";

export type SupportTicketItem = {
  id: string;
  subject: string;
  category: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  subscriberName: string | null;
  raisedByName: string;
  createdAt: string;
};

/**
 * SupportTicket is not a tenant-isolated model, so this filters
 * organization_id explicitly.
 */
export async function getSupportTicketsForOrganization(
  organizationId: string
): Promise<SupportTicketItem[]> {
  const tickets = await prisma.supportTicket.findMany({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      priority: true,
      created_at: true,
      subscriber: { select: { full_name: true } },
      raiser: { select: { full_name: true, email: true } },
    },
  });

  return tickets.map((ticket) => ({
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    subscriberName: ticket.subscriber?.full_name ?? null,
    raisedByName: ticket.raiser.full_name || ticket.raiser.email,
    createdAt: ticket.created_at.toISOString(),
  }));
}
