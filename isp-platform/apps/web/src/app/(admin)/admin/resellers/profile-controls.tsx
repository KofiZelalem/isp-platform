"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { updateResellerProfileAction, toggleResellerActiveAction, type ResellerActionState } from "./actions";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving..." : children}</Button>;
}

export function ResellerProfileControls({ profileId, rate, active }: { profileId: string; rate: string; active: boolean }) {
  const [updateState, updateAction] = useActionState<ResellerActionState, FormData>(updateResellerProfileAction, null);
  const [toggleState, toggleAction] = useActionState<ResellerActionState, FormData>(toggleResellerActiveAction, null);
  return <div className="flex flex-col items-end gap-2">
    <form action={updateAction} className="flex items-center gap-1"><input type="hidden" name="profileId" value={profileId} /><Input className="h-8 w-20" name="commissionRate" type="number" min="0" max="100" step="0.01" defaultValue={rate} aria-label="Commission rate" /><span className="text-xs">%</span><SubmitButton>Save</SubmitButton></form>
    <form action={toggleAction}><input type="hidden" name="profileId" value={profileId} /><input type="hidden" name="active" value={String(!active)} /><SubmitButton>{active ? "Disable" : "Enable"}</SubmitButton></form>
    {updateState && "error" in updateState && <span className="text-xs text-destructive">{updateState.error}</span>}
    {toggleState && "error" in toggleState && <span className="text-xs text-destructive">{toggleState.error}</span>}
  </div>;
}
