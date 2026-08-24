"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { testNotificationProviderAction, type TestNotificationState } from "./test-notification-action";

function SubmitButton({ channel }: { channel: "EMAIL" | "SMS" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Sending..." : `Test ${channel === "EMAIL" ? "email" : "SMS"}`}</Button>;
}

export function TestNotificationControls() {
  const [emailState, emailAction] = useActionState<TestNotificationState, FormData>(testNotificationProviderAction, null);
  const [smsState, smsAction] = useActionState<TestNotificationState, FormData>(testNotificationProviderAction, null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={emailAction}><input type="hidden" name="channel" value="EMAIL" /><SubmitButton channel="EMAIL" /></form>
        <form action={smsAction} className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="channel" value="SMS" />
          <Input name="phone" type="tel" inputMode="tel" placeholder="SMS test number, e.g. 024 123 4567" className="sm:w-64" />
          <SubmitButton channel="SMS" />
        </form>
      </div>
      {(emailState && "error" in emailState) && <p className="text-xs text-destructive">{emailState.error}</p>}
      {(smsState && "error" in smsState) && <p className="text-xs text-destructive">{smsState.error}</p>}
      {(emailState && "success" in emailState) && <p className="text-xs text-emerald-600">Email test sent.</p>}
      {(smsState && "success" in smsState) && <p className="text-xs text-emerald-600">SMS test sent.</p>}
    </div>
  );
}
