"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createResellerCustomerAction, type ResellerCustomerActionState } from "./customer-actions";

function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create customer"}</Button>; }

export function ResellerCustomerForm({ plans }: { plans: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<ResellerCustomerActionState, FormData>(createResellerCustomerAction, null);
  return <form action={formAction} className="grid gap-3 rounded-md border border-border/50 p-4 md:grid-cols-3"><Input name="username" placeholder="Network username" required /><Input name="fullName" placeholder="Full name" required /><Input name="email" type="email" placeholder="Email" /><Input name="phone" placeholder="Phone" /><Input name="password" type="password" minLength={8} placeholder="Initial password" required /><select name="planId" defaultValue="" className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"><option value="">No package yet</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><div><SubmitButton /></div>{state && "error" in state && <p className="text-sm text-destructive md:col-span-3">{state.error}</p>}</form>;
}
