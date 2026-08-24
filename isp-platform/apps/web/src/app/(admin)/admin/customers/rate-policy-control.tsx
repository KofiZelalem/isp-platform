"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { applyRatePolicyAction, type RatePolicyActionState } from "./rate-policy-action";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" disabled={pending}>{pending ? "Applying..." : "Apply rate policy"}</Button>;
}

export function RatePolicyControl({ subscriberId }: { subscriberId: string }) {
  const [state, formAction] = useActionState<RatePolicyActionState, FormData>(applyRatePolicyAction, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="subscriberId" value={subscriberId} />
      <SubmitButton />
      {state && "error" in state && <p className="text-xs text-destructive">{state.error}</p>}
      {state && "success" in state && <p className="text-xs text-emerald-600">Rate policy applied.</p>}
    </form>
  );
}
