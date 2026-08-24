"use server";

import { redirect } from "next/navigation";

import { acceptInvitation } from "@/lib/api/invitations";

export type AcceptInvitationState = { error: string } | { success: true } | null;

export async function acceptInvitationAction(_previousState: AcceptInvitationState, formData: FormData): Promise<AcceptInvitationState> {
  try {
    await acceptInvitation({ token: String(formData.get("token") ?? ""), fullName: String(formData.get("fullName") ?? ""), password: String(formData.get("password") ?? "") });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invitation could not be accepted." };
  }
  redirect("/admin/dashboard");
}
