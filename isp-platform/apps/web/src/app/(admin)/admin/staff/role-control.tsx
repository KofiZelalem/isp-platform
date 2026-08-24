"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { updateStaffRoleAction, type StaffRoleState } from "./actions";

function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving..." : "Save role"}</Button>; }

export function RoleControl({ userId, role }: { userId: string; role: "STAFF" | "RESELLER" | "ISP_ADMIN" }) {
  const [state, formAction] = useActionState<StaffRoleState, FormData>(updateStaffRoleAction, null);
  if (role === "ISP_ADMIN") return <span className="text-xs text-muted-foreground">Protected</span>;
  return <form action={formAction} className="flex flex-wrap items-center justify-end gap-1"><input type="hidden" name="userId" value={userId} /><select name="role" defaultValue={role} className="h-8 rounded-md border border-input bg-background px-2 text-xs"><option value="STAFF">Staff</option><option value="RESELLER">Reseller</option></select><SubmitButton />{state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}</form>;
}