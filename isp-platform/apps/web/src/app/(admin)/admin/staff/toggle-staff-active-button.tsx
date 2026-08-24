"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

import { toggleStaffActiveAction, type ToggleStaffState } from "./actions"

function SubmitButton({ activate }: { activate: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={activate ? "default" : "destructive"} size="sm" disabled={pending}>
      {pending ? "Saving..." : activate ? "Activate" : "Deactivate"}
    </Button>
  )
}

export function ToggleStaffActiveButton({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [state, formAction] = useActionState<ToggleStaffState, FormData>(toggleStaffActiveAction, null)

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="nextActive" value={(!isActive).toString()} />
      <SubmitButton activate={!isActive} />
      {state && "error" in state && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  )
}
