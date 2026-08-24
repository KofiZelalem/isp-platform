"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPayoutAction, type PayoutState } from "./payout-actions";
function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" disabled={pending}>{pending ? "Requesting..." : "Request payout"}</Button>; }
export function RequestPayoutForm() { const [state, formAction] = useActionState<PayoutState, FormData>(requestPayoutAction, null); return <form action={formAction} className="flex items-end gap-2 rounded-md border border-border/50 p-4"><div><label htmlFor="amount" className="text-xs text-muted-foreground">Payout amount</label><Input id="amount" name="amount" type="number" min="0.01" step="0.0001" required /></div><SubmitButton />{state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}</form>; }
