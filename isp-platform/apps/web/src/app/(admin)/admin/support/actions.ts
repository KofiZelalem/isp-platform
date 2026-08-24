"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type UpdateTicketStatusState = { error: string } | { success: true } | null;

type TicketStatusValue = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

const VALID_STATUSES = new Set<TicketStatusValue>(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

function isTicketStatus(value: string): value is TicketStatusValue {
  return VALID_STATUSES.has(value as TicketStatusValue);
}

/** Updates a support ticket's status, scoped to the caller's organization. */
export async function updateTicketStatusAction(
  _prevState: UpdateTicketStatusState,
  formData: FormData
): Promise<UpdateTicketStatusState> {
  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ticketId || !isTicketStatus(status)) return { error: "Invalid ticket update." };

  const { organizationId } = await requireCurrentOrganization();

  const data: { status: TicketStatusValue; resolved_at?: Date; closed_at?: Date } = { status };
  if (status === "RESOLVED") data.resolved_at = new Date();
  if (status === "CLOSED") data.closed_at = new Date();

  const updated = await prisma.supportTicket.updateMany({
    where: { id: ticketId, organization_id: organizationId },
    data,
  });

  if (updated.count === 0) return { error: "Ticket not found." };

  revalidatePath("/admin/support");
  return { success: true };
}
