"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createInvitationAction, type InvitationActionState } from "./invitation-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Sending..." : "Send invitation"}</Button>;
}

export function InviteForm() {
  const [state, formAction] = useActionState<InvitationActionState, FormData>(createInvitationAction, null);
  return <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md border border-border/50 p-4">
    <div className="flex flex-col gap-1"><label htmlFor="email" className="text-xs text-muted-foreground">Email</label><Input id="email" name="email" type="email" required placeholder="person@example.com" /></div>
    <div className="flex flex-col gap-1"><label htmlFor="role" className="text-xs text-muted-foreground">Role</label><select id="role" name="role" defaultValue="STAFF" className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"><option value="STAFF">Staff</option><option value="RESELLER">Reseller</option></select></div>
    <SubmitButton />
    {state && "error" in state && <p className="w-full text-sm text-destructive">{state.error}</p>}
    {state && "success" in state && <p className="w-full text-sm text-emerald-600">Invitation sent.</p>}
  </form>;
}
