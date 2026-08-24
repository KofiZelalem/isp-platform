"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { approvePayoutAction, payPayoutAction, type PayoutState } from "../../reseller/payout-actions";
function SubmitButton({ children }: { children: React.ReactNode }) { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving..." : children}</Button>; }
export function PayoutControls({ id, status }: { id: string; status: string }) { const [approve, approveAction] = useActionState<PayoutState, FormData>(approvePayoutAction, null); const [pay, payAction] = useActionState<PayoutState, FormData>(payPayoutAction, null); return <div className="flex gap-1">{status === "PENDING" && <form action={approveAction}><input type="hidden" name="payoutId" value={id} /><SubmitButton>Approve</SubmitButton></form>}{status === "APPROVED" && <form action={payAction}><input type="hidden" name="payoutId" value={id} /><SubmitButton>Mark paid</SubmitButton></form>}{(approve && "error" in approve) && <span className="text-xs text-destructive">{approve.error}</span>}{(pay && "error" in pay) && <span className="text-xs text-destructive">{pay.error}</span>}</div>; }
