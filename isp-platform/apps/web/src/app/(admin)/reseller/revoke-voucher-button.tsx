"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { revokeOwnVoucherAction, type ResellerVoucherActionState } from "./actions";

function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="destructive" disabled={pending}>{pending ? "Revoking..." : "Revoke"}</Button>; }

export function RevokeVoucherButton({ voucherId }: { voucherId: string }) {
  const [state, formAction] = useActionState<ResellerVoucherActionState, FormData>(revokeOwnVoucherAction, null);
  return <form action={formAction}><input type="hidden" name="voucherId" value={voucherId} /><SubmitButton />{state && "error" in state && <span className="ml-2 text-xs text-destructive">{state.error}</span>}</form>;
}
