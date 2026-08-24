"use client"

import { useActionState } from "react"
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

import { createServicePlan, type CreateServicePlanState } from "./actions"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create package"}
    </Button>
  )
}

export function CreatePackageSheet() {
  const [state, formAction] = useActionState<CreateServicePlanState, FormData>(
    createServicePlan,
    null
  )

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Package
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create service plan</SheetTitle>
          <SheetDescription>
            Add a new package that customers can subscribe to.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Weekly 20GB" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="Fast access for a week" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Price</Label>
            <Input id="price" name="price" type="number" min="0" step="0.01" placeholder="40.00" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="validityDays">Duration (days)</Label>
            <Input id="validityDays" name="validityDays" type="number" min="1" step="1" placeholder="7" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planType">Access type</Label>
              <select id="planType" name="planType" defaultValue="UNLIMITED" className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm">
                <option value="TIME_BASED">Time based</option>
                <option value="DATA_BASED">Data based</option>
                <option value="UNLIMITED">Unlimited</option>
                <option value="VOUCHER">Voucher</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planPeriod">Package period</Label>
              <select id="planPeriod" name="planPeriod" defaultValue="CUSTOM" className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm">
                <option value="HOURLY">Hourly</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dataLimitMb">Data limit (MB)</Label>
            <Input
              id="dataLimitMb"
              name="dataLimitMb"
              type="number"
              min="1"
              step="1"
              placeholder="Leave blank for unlimited"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="speedDownloadKbps">Download speed (Kbps)</Label>
            <Input
              id="speedDownloadKbps"
              name="speedDownloadKbps"
              type="number"
              min="1"
              step="1"
              placeholder="20480"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="speedUploadKbps">Upload speed (Kbps)</Label>
            <Input
              id="speedUploadKbps"
              name="speedUploadKbps"
              type="number"
              min="1"
              step="1"
              placeholder="10240"
            />
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
