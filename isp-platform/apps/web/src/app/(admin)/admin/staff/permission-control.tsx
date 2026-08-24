"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { updateStaffPermissionsAction, type StaffPermissionState } from "./actions";

function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving..." : "Save access"}</Button>; }

export function PermissionControl({ userId, permissions }: { userId: string; permissions: string[] }) {
  const [state, formAction] = useActionState<StaffPermissionState, FormData>(updateStaffPermissionsAction, null);
  return <form action={formAction} className="flex flex-col items-end gap-1 text-xs"><input type="hidden" name="userId" value={userId} /><label><input type="checkbox" name="permission" value="STAFF_MANAGE" defaultChecked={permissions.includes("STAFF_MANAGE")} /> Staff management</label><label><input type="checkbox" name="permission" value="RESELLER_MANAGE" defaultChecked={permissions.includes("RESELLER_MANAGE")} /> Reseller management</label><SubmitButton />{state && "error" in state && <span className="text-destructive">{state.error}</span>}</form>;
}