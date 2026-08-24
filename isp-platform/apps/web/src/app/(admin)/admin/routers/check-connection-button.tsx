"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { checkRouterConnectionAction, type CheckRouterState } from "./check-connection-action";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Checking..." : "Test connection"}</Button>;
}

export function CheckConnectionButton({ nodeId }: { nodeId: string }) {
  const [state, formAction] = useActionState<CheckRouterState, FormData>(checkRouterConnectionAction, null);
  return (
    <form action={formAction} className="mt-2 flex flex-col items-start gap-1">
      <input type="hidden" name="nodeId" value={nodeId} />
      <SubmitButton />
      {state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}
      {state && "success" in state && <span className="text-xs text-emerald-600">Connected</span>}
    </form>
  );
}
