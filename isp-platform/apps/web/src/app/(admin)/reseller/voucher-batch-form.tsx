"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createResellerVoucherBatchAction, type ResellerVoucherState } from "./voucher-actions";
function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" disabled={pending}>{pending ? "Generating..." : "Generate vouchers"}</Button>; }
export function VoucherBatchForm({ plans }: { plans: { id: string; name: string }[] }) { const [state, formAction] = useActionState<ResellerVoucherState, FormData>(createResellerVoucherBatchAction, null); return <form action={formAction} className="grid gap-2 rounded-md border border-border/50 p-4 md:grid-cols-4"><Input name="name" placeholder="Batch name" required /><select name="planId" required className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="">Package</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><Input name="quantity" type="number" min="1" max="500" defaultValue="25" required /><Input name="sellingPrice" type="number" min="0.01" step="0.01" placeholder="Price" required /><SubmitButton />{state && "error" in state && <p className="text-sm text-destructive md:col-span-4">{state.error}</p>}</form>; }
