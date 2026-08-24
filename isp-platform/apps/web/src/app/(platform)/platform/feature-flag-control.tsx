"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { setFeatureFlagAction, type PlatformActionState } from "./feature-flag-action";

function SubmitButton({ enabled }: { enabled: boolean }) { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant={enabled ? "outline" : "default"} disabled={pending}>{pending ? "Saving..." : enabled ? "Disable" : "Enable"}</Button>; }

export function FeatureFlagControl({ organizationId, keyName, enabled }: { organizationId: string; keyName: string; enabled: boolean }) {
  const [state, formAction] = useActionState<PlatformActionState, FormData>(setFeatureFlagAction, null);
  return <form action={formAction} className="flex items-center gap-2"><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="key" value={keyName} /><input type="hidden" name="enabled" value={String(!enabled)} /><SubmitButton enabled={enabled} />{state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}</form>;
}
