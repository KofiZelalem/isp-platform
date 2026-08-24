"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

import { disconnectSessionAction, type DisconnectSessionState } from "./actions"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="destructive" size="sm" disabled={pending}>
      {pending ? "Disconnecting..." : "Disconnect"}
    </Button>
  )
}

export function DisconnectSessionButton({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useActionState<DisconnectSessionState, FormData>(
    disconnectSessionAction,
    null
  )

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton />
      {state && "error" in state && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
    </form>
  )
}
