"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateResellerCustomerAction, type ResellerCustomerActionState } from "./customer-actions";
import { TerminateCustomerButton } from "./customer-terminate-button";

function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>; }

export function EditResellerCustomerForm({ customer }: { customer: { id: string; username: string; name: string; email: string | null; phone?: string | null } }) {
  const [state, formAction] = useActionState<ResellerCustomerActionState, FormData>(updateResellerCustomerAction, null);
  return <div className="flex flex-wrap items-center justify-end gap-1"><form action={formAction} className="flex flex-wrap items-center justify-end gap-1"><input type="hidden" name="subscriberId" value={customer.id} /><input type="hidden" name="username" value={customer.username} /><Input name="fullName" defaultValue={customer.name} className="h-8 w-32" aria-label="Full name" /><Input name="email" defaultValue={customer.email ?? ""} className="h-8 w-40" aria-label="Email" /><Input name="phone" defaultValue={customer.phone ?? ""} className="h-8 w-32" aria-label="Phone" /><SubmitButton />{state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}</form><TerminateCustomerButton subscriberId={customer.id} /></div>;
}
