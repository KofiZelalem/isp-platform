"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { updateServicePlan, type PackageActionState } from "./actions"

type PackageValues = {
  id: string
  name: string
  description: string | null
  price: string
  validityDays: number
  planType: string
  planPeriod: string
  dataLimitMb: number | null
  speedUploadKbps: number | null
  speedDownloadKbps: number | null
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
}

export function EditPackageSheet({ plan }: { plan: PackageValues }) {
  const [state, formAction] = useActionState<PackageActionState, FormData>(updateServicePlan, null)
  return <Sheet><SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${plan.name}`}><Pencil className="h-4 w-4" /></Button>} /><SheetContent><SheetHeader><SheetTitle>Edit package</SheetTitle><SheetDescription>Changes apply to future assignments; existing subscriptions keep their entitlement dates.</SheetDescription></SheetHeader><form action={formAction} className="flex flex-col gap-4 overflow-y-auto px-4"><input type="hidden" name="planId" value={plan.id} /><div className="flex flex-col gap-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" defaultValue={plan.name} required /></div><div className="flex flex-col gap-1.5"><Label htmlFor="description">Description</Label><Input id="description" name="description" defaultValue={plan.description ?? ""} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-1.5"><Label htmlFor="price">Price</Label><Input id="price" name="price" type="number" min="0" step="0.01" defaultValue={plan.price} required /></div><div className="flex flex-col gap-1.5"><Label htmlFor="validityDays">Duration (days)</Label><Input id="validityDays" name="validityDays" type="number" min="1" step="1" defaultValue={plan.validityDays} required /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-1.5"><Label htmlFor="planType">Access type</Label><select id="planType" name="planType" defaultValue={plan.planType} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"><option value="TIME_BASED">Time based</option><option value="DATA_BASED">Data based</option><option value="UNLIMITED">Unlimited</option><option value="VOUCHER">Voucher</option></select></div><div className="flex flex-col gap-1.5"><Label htmlFor="planPeriod">Package period</Label><select id="planPeriod" name="planPeriod" defaultValue={plan.planPeriod} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"><option value="HOURLY">Hourly</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="CUSTOM">Custom</option></select></div></div><div className="flex flex-col gap-1.5"><Label htmlFor="dataLimitMb">Data limit (MB)</Label><Input id="dataLimitMb" name="dataLimitMb" type="number" min="1" step="1" defaultValue={plan.dataLimitMb ?? ""} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-1.5"><Label htmlFor="speedDownloadKbps">Download speed (Kbps)</Label><Input id="speedDownloadKbps" name="speedDownloadKbps" type="number" min="1" step="1" defaultValue={plan.speedDownloadKbps ?? ""} /></div><div className="flex flex-col gap-1.5"><Label htmlFor="speedUploadKbps">Upload speed (Kbps)</Label><Input id="speedUploadKbps" name="speedUploadKbps" type="number" min="1" step="1" defaultValue={plan.speedUploadKbps ?? ""} /></div></div>{state && "error" in state && <p className="text-sm text-destructive">{state.error}</p>}<SheetFooter className="flex-row justify-end gap-2 px-0"><SheetClose render={<Button type="button" variant="outline" />}>Cancel</SheetClose><SubmitButton /></SheetFooter></form></SheetContent></Sheet>
}