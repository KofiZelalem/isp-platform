"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { generateReportAction, type GenerateReportState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating..." : "Generate report"}
    </Button>
  );
}

export function GenerateReportCard() {
  const [state, formAction] = useActionState<GenerateReportState, FormData>(
    generateReportAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 rounded-md border border-border/50 p-4 md:grid-cols-4"
    >
      <div className="space-y-1">
        <label htmlFor="type" className="text-xs text-muted-foreground">
          Report type
        </label>
        <select
          id="type"
          name="type"
          defaultValue="SESSION_USAGE_CSV"
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
        >
          <option value="SESSION_USAGE_CSV">Session usage CSV</option>
          <option value="USAGE_SUMMARY_CSV">Usage summary CSV</option>
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="windowStart" className="text-xs text-muted-foreground">
          Start date
        </label>
        <input
          id="windowStart"
          name="windowStart"
          type="date"
          required
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="windowEnd" className="text-xs text-muted-foreground">
          End date
        </label>
        <input
          id="windowEnd"
          name="windowEnd"
          type="date"
          required
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
        />
      </div>
      <div className="flex items-end gap-2">
        <SubmitButton />
      </div>
      {state && "error" in state && (
        <p className="text-sm text-destructive md:col-span-4">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-emerald-600 md:col-span-4">Report generated successfully.</p>
      )}
    </form>
  );
}
