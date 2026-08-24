"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptInvitationAction, type AcceptInvitationState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating account..." : "Accept invitation"}</Button>;
}

export function InviteAcceptanceForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<AcceptInvitationState, FormData>(acceptInvitationAction, null);
  return <form action={formAction} className="space-y-4"><input type="hidden" name="token" value={token} /><div className="space-y-2"><label htmlFor="fullName" className="text-sm font-medium">Full name</label><Input id="fullName" name="fullName" required /></div><div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Password</label><Input id="password" name="password" type="password" minLength={8} required /></div>{state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}<SubmitButton /></form>;
}
