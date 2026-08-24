"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { terminateResellerCustomerAction, type TerminateCustomerState } from "./customer-terminate-action";
function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="destructive" disabled={pending}>{pending ? "Closing..." : "Terminate"}</Button>; }
export function TerminateCustomerButton({ subscriberId }: { subscriberId: string }) { const [state, formAction] = useActionState<TerminateCustomerState, FormData>(terminateResellerCustomerAction, null); return <form action={formAction}><input type="hidden" name="subscriberId" value={subscriberId} /><SubmitButton />{state && "error" in state && <span className="ml-2 text-xs text-destructive">{state.error}</span>}</form>; }
