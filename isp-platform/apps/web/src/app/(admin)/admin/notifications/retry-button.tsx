"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { retryNotificationAction, type RetryNotificationState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Retrying..." : "Retry delivery"}</Button>;
}

export function RetryButton({ notificationId }: { notificationId: string }) {
  const [state, formAction] = useActionState<RetryNotificationState, FormData>(retryNotificationAction, null);
  return <form action={formAction} className="mt-2 flex flex-col items-start gap-1"><input type="hidden" name="notificationId" value={notificationId} /><SubmitButton />{state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}{state && "success" in state && <span className="text-xs text-emerald-600">Retry sent.</span>}</form>;
}