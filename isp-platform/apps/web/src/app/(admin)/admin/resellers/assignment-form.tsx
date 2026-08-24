"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { assignCustomerToResellerAction, type AssignmentState } from "./assignment-actions";

function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" disabled={pending}>{pending ? "Assigning..." : "Assign customer"}</Button>; }

export function AssignmentForm({ profiles, customers }: { profiles: { id: string; name: string }[]; customers: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<AssignmentState, FormData>(assignCustomerToResellerAction, null);
  return <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-md border border-border/50 p-4"><div className="flex flex-col gap-1"><label htmlFor="profileId" className="text-xs text-muted-foreground">Reseller</label><select id="profileId" name="profileId" required className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="">Select reseller</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div><div className="flex flex-col gap-1"><label htmlFor="subscriberId" className="text-xs text-muted-foreground">Customer</label><select id="subscriberId" name="subscriberId" required className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><SubmitButton />{state && "error" in state && <p className="w-full text-xs text-destructive">{state.error}</p>}</form>;
}
