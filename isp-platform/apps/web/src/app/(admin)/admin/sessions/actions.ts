"use server";

import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { operateOnSessionRemotely } from "@/lib/api/remote-session-operations";

export type DisconnectSessionState = { error: string } | { success: true } | null;

/** Disconnects a session remotely, then marks it terminated only after hardware success. */
export async function disconnectSessionAction(
  _prevState: DisconnectSessionState,
  formData: FormData
): Promise<DisconnectSessionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { error: "Missing session id." };

  const { organizationId } = await requireCurrentOrganization();

  const result = await operateOnSessionRemotely(organizationId, sessionId, "disconnect");
  if (result.status === "FAILED") return { error: result.error ?? "Router disconnect failed." };

  const tenantDb = createTenantClient(prisma, organizationId);
  await tenantDb.session.update({
    where: { id: sessionId },
    data: { status: "TERMINATED", ended_at: new Date(), termination_cause: "Admin-Disconnect" },
  });

  revalidatePath("/admin/sessions");
  return { success: true };
}

export async function reconnectSessionAction(
  _prevState: DisconnectSessionState,
  formData: FormData
): Promise<DisconnectSessionState> {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) return { error: "Missing session id." };
  const { organizationId } = await requireCurrentOrganization();
  const result = await operateOnSessionRemotely(organizationId, sessionId, "reconnect");
  if (result.status === "FAILED") return { error: result.error ?? "Router reconnect failed." };
  revalidatePath("/admin/sessions");
  return { success: true };
}
