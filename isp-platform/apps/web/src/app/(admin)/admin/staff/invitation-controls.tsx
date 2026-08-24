"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { revokeInvitationAction, resendInvitationAction, type InvitationActionState } from "./invitation-actions";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Working..." : children}</Button>;
}

export function InvitationControls({ invitationId }: { invitationId: string }) {
  const [revokeState, revokeAction] = useActionState<InvitationActionState, FormData>(revokeInvitationAction, null);
  const [resendState, resendAction] = useActionState<InvitationActionState, FormData>(resendInvitationAction, null);
  return <div className="flex flex-wrap gap-2"><form action={resendAction}><input type="hidden" name="invitationId" value={invitationId} /><SubmitButton>Resend</SubmitButton></form><form action={revokeAction}><input type="hidden" name="invitationId" value={invitationId} /><SubmitButton>Revoke</SubmitButton></form>{revokeState && "error" in revokeState && <span className="text-xs text-destructive">{revokeState.error}</span>}{resendState && "error" in resendState && <span className="text-xs text-destructive">{resendState.error}</span>}</div>;
}
