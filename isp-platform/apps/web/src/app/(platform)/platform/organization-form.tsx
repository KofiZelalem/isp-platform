"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePlatformOrganizationAction, type OrganizationActionState } from "./organization-action";
function SubmitButton() { const { pending } = useFormStatus(); return <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>; }
export function OrganizationForm({ organization }: { organization: { id: string; name: string; planTier: string; timezone: string } }) { const [state, formAction] = useActionState<OrganizationActionState, FormData>(updatePlatformOrganizationAction, null); return <form action={formAction} className="flex flex-wrap items-center gap-1"><input type="hidden" name="organizationId" value={organization.id} /><Input name="name" defaultValue={organization.name} className="h-8 w-32" aria-label="Organization name" /><Input name="planTier" defaultValue={organization.planTier} className="h-8 w-24" aria-label="Plan tier" /><Input name="timezone" defaultValue={organization.timezone} className="h-8 w-24" aria-label="Timezone" /><SubmitButton />{state && "error" in state && <span className="text-xs text-destructive">{state.error}</span>}</form>; }
