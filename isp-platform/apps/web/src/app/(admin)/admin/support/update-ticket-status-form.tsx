"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

import { updateTicketStatusAction, type UpdateTicketStatusState } from "./actions"

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : "Update"}
    </Button>
  )
}

export function UpdateTicketStatusForm({
  ticketId,
  currentStatus,
}: {
  ticketId: string
  currentStatus: string
}) {
  const [state, formAction] = useActionState<UpdateTicketStatusState, FormData>(
    updateTicketStatusAction,
    null
  )

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="ticketId" value={ticketId} />
        <select
          name="status"
          defaultValue={currentStatus}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status.replace("_", " ")}
            </option>
          ))}
        </select>
        <SubmitButton />
      </div>
      {state && "error" in state && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  )
}
