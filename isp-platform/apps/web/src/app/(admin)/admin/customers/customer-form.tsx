"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet"

import { createCustomerAction, updateCustomerAction, type CustomerActionState } from "./actions"

type CustomerFormValues = {
  id?: string
  username: string
  fullName: string
  email: string
  phone: string
  address: string
  notes: string
  status: string
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>{pending ? "Saving..." : editing ? "Save changes" : "Create customer"}</Button>
}

function CustomerFields({ values, editing }: { values: CustomerFormValues; editing: boolean }) {
  return (
    <>
      {editing && <input type="hidden" name="customerId" value={values.id} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" defaultValue={values.username} placeholder="e.g. ama.owusu" required readOnly={editing} />
        {editing && <p className="text-xs text-muted-foreground">Username is the customer&apos;s network identity and cannot be changed here.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" defaultValue={values.fullName} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={values.email} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={values.phone} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={values.address} />
      </div>
      {editing && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={values.status} className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm">
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="EXPIRED">Expired</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea id="notes" name="notes" defaultValue={values.notes} rows={4} className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
      </div>
    </>
  )
}

function FormFeedback({ state }: { state: CustomerActionState }) {
  return state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null
}

export function CreateCustomerSheet() {
  const [state, formAction] = useActionState(createCustomerAction, null)
  const empty: CustomerFormValues = { username: "", fullName: "", email: "", phone: "", address: "", notes: "", status: "ACTIVE" }

  return (
    <Sheet>
      <SheetTrigger render={<Button>Add customer</Button>} />
      <SheetContent>
        <SheetHeader><SheetTitle>Create customer</SheetTitle><SheetDescription>Add a customer to your organization. Network credentials are generated server-side.</SheetDescription></SheetHeader>
        <form action={formAction} className="flex flex-col gap-4 overflow-y-auto px-4"><CustomerFields values={empty} editing={false} /><FormFeedback state={state} /><SheetFooter className="flex-row justify-end gap-2 px-0"><SheetClose render={<Button type="button" variant="outline" />}>Cancel</SheetClose><SubmitButton editing={false} /></SheetFooter></form>
      </SheetContent>
    </Sheet>
  )
}

export function EditCustomerSheet({ customer }: { customer: CustomerFormValues }) {
  const [state, formAction] = useActionState(updateCustomerAction, null)

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline">Edit customer</Button>} />
      <SheetContent>
        <SheetHeader><SheetTitle>Edit customer</SheetTitle><SheetDescription>Update this customer&apos;s contact details, status, and notes.</SheetDescription></SheetHeader>
        <form action={formAction} className="flex flex-col gap-4 overflow-y-auto px-4"><CustomerFields values={customer} editing={true} /><FormFeedback state={state} /><SheetFooter className="flex-row justify-end gap-2 px-0"><SheetClose render={<Button type="button" variant="outline" />}>Cancel</SheetClose><SubmitButton editing={true} /></SheetFooter></form>
      </SheetContent>
    </Sheet>
  )
}