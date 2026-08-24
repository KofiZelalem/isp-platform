import { beforeEach, describe, expect, it, vi } from "vitest"

const requireCurrentOrganization = vi.fn()
const create = vi.fn()
const update = vi.fn()
const revalidatePath = vi.fn()

vi.mock("@/lib/auth", () => ({ requireCurrentOrganization }))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("database", () => ({
  createTenantClient: vi.fn(() => ({ subscriber: { create, update } })),
}))
vi.mock("next/cache", () => ({ revalidatePath }))

const { createCustomerAction, updateCustomerAction, deleteCustomerAction } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const customerFields = {
  username: "ama.owusu",
  fullName: "Ama Owusu",
  email: "ama@example.com",
  phone: "+233200000000",
  address: "Accra",
  notes: "Priority customer",
  status: "ACTIVE",
}

describe("customer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a" })
  })

  it("creates a customer under the authenticated organization", async () => {
    create.mockResolvedValue({ id: "customer-a" })

    await expect(createCustomerAction(null, form(customerFields))).resolves.toEqual({ success: true })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ username: "ama.owusu", full_name: "Ama Owusu" }),
    }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organization_id: "org-a" }),
    }))
  })

  it("allows a customer without an email address", async () => {
    create.mockResolvedValue({ id: "customer-a" })

    await expect(createCustomerAction(null, form({ ...customerFields, email: "" }))).resolves.toEqual({ success: true })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: null }),
    }))
  })

  it("ignores a client-supplied organization_id on create", async () => {
    create.mockResolvedValue({ id: "customer-a" })

    await createCustomerAction(null, form({ ...customerFields, organization_id: "org-b" }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organization_id: "org-a" }),
    }))
  })

  it("updates a customer through the authenticated tenant client", async () => {
    update.mockResolvedValue({ id: "customer-a" })

    await expect(updateCustomerAction(null, form({ ...customerFields, customerId: "customer-a" }))).resolves.toEqual({ success: true })
    expect(update).toHaveBeenCalledWith({
      where: { id: "customer-a" },
      data: expect.objectContaining({ status: "ACTIVE", notes: "Priority customer" }),
    })
  })

  it("cannot update a customer outside the authenticated organization", async () => {
    update.mockRejectedValue({ code: "P2025" })

    await expect(updateCustomerAction(null, form({ ...customerFields, customerId: "customer-b" }))).resolves.toEqual({ error: "Customer not found." })
  })

  it("cannot delete a customer outside the authenticated organization", async () => {
    update.mockRejectedValue({ code: "P2025" })

    await expect(deleteCustomerAction(null, form({ customerId: "customer-b" }))).resolves.toEqual({ error: "Customer not found." })
  })

  it("requires authenticated organization context before mutations", async () => {
    requireCurrentOrganization.mockRejectedValue(new Error("REDIRECT:/login"))

    await expect(createCustomerAction(null, form(customerFields))).rejects.toThrow("REDIRECT:/login")
    expect(create).not.toHaveBeenCalled()
  })
})
