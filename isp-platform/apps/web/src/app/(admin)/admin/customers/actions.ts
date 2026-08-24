"use server"

import { randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"

import { createTenantClient } from "database"

import { requireCurrentOrganization } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseFormData, requireSameOrigin, requiredId } from "@/lib/request-security"
import { z } from "zod"

export type CustomerActionState = { error: string } | { success: true } | null

const customerInputSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9._-]+$/),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().max(254).email().or(z.literal("")),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(255),
  notes: z.string().trim().max(2000),
  status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED"]).default("ACTIVE"),
})

const customerSchema = customerInputSchema.transform((value) => ({
  username: value.username,
  full_name: value.fullName,
  email: value.email || null,
  phone: value.phone || null,
  address: value.address || null,
  notes: value.notes || null,
  status: value.status,
}))

export async function createCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const fields = parseFormData(formData, customerSchema)
  if (!fields.success) return { error: fields.error }

  await requireSameOrigin()
  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)

  try {
    await tenantDb.subscriber.create({
      data: {
        ...fields.data,
        organization_id: organizationId,
        password_hash: randomBytes(32).toString("hex"),
      },
    })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { error: "A customer with this username already exists in your organization." }
    }
    throw error
  }

  revalidatePath("/admin/customers")
  return { success: true }
}

export async function updateCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const parsed = parseFormData(formData, customerInputSchema.extend({ customerId: requiredId }))
  if (!parsed.success) return { error: parsed.error }
  const { customerId, ...input } = parsed.data
  const fields = customerSchema.parse(input)

  await requireSameOrigin()
  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)

  try {
    await tenantDb.subscriber.update({ where: { id: customerId }, data: fields })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return { error: "Customer not found." }
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { error: "A customer with this username already exists in your organization." }
    }
    throw error
  }

  revalidatePath("/admin/customers")
  revalidatePath(`/admin/customers/${customerId}`)
  return { success: true }
}

export async function deleteCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const parsed = parseFormData(formData, z.object({ customerId: requiredId }))
  if (!parsed.success) return { error: parsed.error }
  const { customerId } = parsed.data

  await requireSameOrigin()
  const { organizationId } = await requireCurrentOrganization()
  const tenantDb = createTenantClient(prisma, organizationId)

  try {
    await tenantDb.subscriber.update({
      where: { id: customerId },
      data: { deleted_at: new Date(), status: "TERMINATED" },
    })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return { error: "Customer not found." }
    }
    throw error
  }

  revalidatePath("/admin/customers")
  revalidatePath(`/admin/customers/${customerId}`)
  return { success: true }
}