"use client"

import * as React from "react"
import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { Plus } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ActiveServicePlanOption } from "@/lib/api/vouchers"
import type { ResellerOption } from "@/lib/api/resellers"

import { createVoucherBatchAction, type CreateVoucherBatchState } from "./actions"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating..." : "Generate vouchers"}
    </Button>
  )
}

export function CreateVoucherBatchSheet({
  plans,
  resellers,
}: {
  plans: ActiveServicePlanOption[]
  resellers: ResellerOption[]
}) {
  const [open, setOpen] = React.useState(false)
  const [state, formAction] = useActionState<CreateVoucherBatchState, FormData>(
    createVoucherBatchAction,
    null
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state && "success" in state) {
      // Syncs sheet visibility to the external form-action result, not internal render state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false)
      formRef.current?.reset()
    }
  }, [state])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button className="flex items-center gap-2" disabled={plans.length === 0}>
            <Plus className="h-4 w-4" />
            Generate Vouchers
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Generate voucher batch</SheetTitle>
          <SheetDescription>
            Create a batch of pre-paid Wi-Fi voucher codes for a package.
          </SheetDescription>
        </SheetHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Batch name</Label>
            <Input id="name" name="name" placeholder="e.g. August walk-in batch" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="planId">Package</Label>
            <select
              id="planId"
              name="planId"
              required
              defaultValue=""
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="" disabled>
                Select a package
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prefix">Code prefix (optional)</Label>
            <Input id="prefix" name="prefix" placeholder="e.g. NEXA-" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resellerId">Reseller attribution (optional)</Label>
            <select
              id="resellerId"
              name="resellerId"
              defaultValue=""
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">No reseller</option>
              {resellers.map((reseller) => (
                <option key={reseller.id} value={reseller.id}>
                  {reseller.name} ({reseller.commissionRate}%)
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" name="quantity" type="number" min="1" max="5000" step="1" placeholder="50" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sellingPrice">Selling price per voucher</Label>
            <Input id="sellingPrice" name="sellingPrice" type="number" min="0" step="0.01" placeholder="10.00" required />
          </div>
          {state && "error" in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <SheetFooter className="flex-row justify-end gap-2 px-0">
            <SheetClose render={<Button type="button" variant="outline" />}>Cancel</SheetClose>
            <SubmitButton />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
