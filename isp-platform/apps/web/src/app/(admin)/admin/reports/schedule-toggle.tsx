"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { toggleScheduleAction, type ScheduleActionState } from "./schedule-actions";

function ToggleButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={enabled ? "outline" : "default"} size="sm" disabled={pending}>{pending ? "Saving..." : enabled ? "Disable" : "Enable"}</Button>;
}

export function ScheduleToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [state, formAction] = useActionState<ScheduleActionState, FormData>(toggleScheduleAction, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="scheduleId" value={id} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <ToggleButton enabled={enabled} />
      {state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
