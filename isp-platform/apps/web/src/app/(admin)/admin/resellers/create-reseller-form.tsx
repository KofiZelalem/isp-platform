"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { createResellerProfileAction, type ResellerActionState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create profile"}</Button>;
}

export function CreateResellerForm({ users }: { users: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<ResellerActionState, FormData>(createResellerProfileAction, null);
  return <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-md border border-border/50 p-4">
    <div className="flex flex-col gap-1"><label htmlFor="userId" className="text-xs text-muted-foreground">Reseller user</label><select id="userId" name="userId" required className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div>
    <div className="flex flex-col gap-1"><label htmlFor="commissionRate" className="text-xs text-muted-foreground">Commission %</label><input id="commissionRate" name="commissionRate" type="number" min="0" max="100" step="0.01" defaultValue="10" required className="h-9 w-24 rounded-md border border-input bg-background px-2.5 text-sm" /></div>
    <SubmitButton />
    {state && "error" in state && <p className="w-full text-sm text-destructive">{state.error}</p>}
  </form>;
}
