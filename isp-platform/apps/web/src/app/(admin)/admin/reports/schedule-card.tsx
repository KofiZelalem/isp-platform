"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { createScheduleAction, type ScheduleActionState } from "./schedule-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Create schedule"}</Button>;
}

export function ScheduleCard() {
  const [state, formAction] = useActionState<ScheduleActionState, FormData>(createScheduleAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 rounded-md border border-border/50 p-4 md:grid-cols-5">
      <select name="type" defaultValue="SESSION_USAGE_CSV" className="h-9 rounded-md border border-input bg-background px-2.5 text-sm">
        <option value="SESSION_USAGE_CSV">Session usage CSV</option>
        <option value="USAGE_SUMMARY_CSV">Usage summary CSV</option>
      </select>
      <select name="frequency" defaultValue="DAILY" className="h-9 rounded-md border border-input bg-background px-2.5 text-sm">
        <option value="DAILY">Daily</option>
        <option value="WEEKLY">Weekly</option>
        <option value="MONTHLY">Monthly</option>
      </select>
      <select name="deliveryChannel" defaultValue="IN_APP" className="h-9 rounded-md border border-input bg-background px-2.5 text-sm">
        <option value="IN_APP">In app</option>
        <option value="EMAIL">Email</option>
        <option value="WEBHOOK">Webhook</option>
      </select>
      <input name="deliveryTarget" placeholder="Email or HTTPS webhook URL" className="h-9 rounded-md border border-input bg-background px-2.5 text-sm" />
      <div className="flex items-center gap-2"><SubmitButton /></div>
      {state && "error" in state && <p className="text-sm text-destructive md:col-span-5">{state.error}</p>}
    </form>
  );
}
