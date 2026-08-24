"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { subscriberNetworkAction, type SubscriberNetworkActionState } from "./subscriber-network-actions";

function SubmitButton({ operation }: { operation: "isolate" | "restore" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={operation === "isolate" ? "destructive" : "default"} disabled={pending}>{pending ? "Working..." : operation === "isolate" ? "Suspend and isolate" : "Restore access"}</Button>;
}

export function SubscriberNetworkControls({ subscriberId, suspended }: { subscriberId: string; suspended: boolean }) {
  const [state, formAction] = useActionState<SubscriberNetworkActionState, FormData>(subscriberNetworkAction, null);
  const operation = suspended ? "restore" : "isolate";
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="subscriberId" value={subscriberId} />
      <input type="hidden" name="operation" value={operation} />
      <SubmitButton operation={operation} />
      {state && "error" in state && <p className="text-xs text-destructive">{state.error}</p>}
      {state && "success" in state && <p className="text-xs text-emerald-600">Network access updated.</p>}
    </form>
  );
}
