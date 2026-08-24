import { beforeEach, describe, expect, it, vi } from "vitest"

const requireCurrentOrganization = vi.fn()
const create = vi.fn()
const update = vi.fn()
const updateMany = vi.fn()
const count = vi.fn()
const revalidatePath = vi.fn()

vi.mock("@/lib/auth", () => ({ requireCurrentOrganization }))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("database", () => ({
  createTenantClient: vi.fn(() => ({
    servicePlan: { create, update, updateMany },
    subscription: { count },
  })),
}))
vi.mock("next/cache", () => ({ revalidatePath }))

const { createServicePlan, updateServicePlan, setServicePlanActive, archiveServicePlan } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

const fields = {
  name: "Weekly 20GB",
  description: "Fast weekly access",
  price: "40",
  validityDays: "7",
  planType: "DATA_BASED",
  planPeriod: "WEEKLY",
  dataLimitMb: "20480",
  speedUploadKbps: "10240",
  speedDownloadKbps: "20480",
}

describe("package actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a" })
    updateMany.mockResolvedValue({ count: 1 })
    count.mockResolvedValue(0)
  })

  it("creates a package using the authenticated organization", async () => {
    create.mockResolvedValue({ id: "plan-a" })
    await expect(createServicePlan(null, form({ ...fields, organization_id: "org-b" }))).resolves.toEqual({ success: true })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: "org-a", plan_type: "DATA_BASED" }) }))
  })

  it("rejects invalid package values before database access", async () => {
    await expect(createServicePlan(null, form({ ...fields, price: "-1" }))).resolves.toEqual({ error: "Enter a valid non-negative price." })
    expect(create).not.toHaveBeenCalled()
  })

  it("updates only through the authenticated tenant client", async () => {
    update.mockResolvedValue({ id: "plan-a" })
    await expect(updateServicePlan(null, form({ ...fields, planId: "plan-a" }))).resolves.toEqual({ success: true })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "plan-a" } }))
  })

  it("activates and deactivates a tenant package", async () => {
    await expect(setServicePlanActive(null, form({ planId: "plan-a", isActive: "false" }))).resolves.toEqual({ success: true })
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "plan-a", deleted_at: null }, data: { is_active: false } })
  })

  it("does not archive a package with active subscriptions", async () => {
    count.mockResolvedValue(1)
    await expect(archiveServicePlan(null, form({ planId: "plan-a" }))).resolves.toEqual({ error: "This package has active subscriptions and cannot be archived." })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("requires authentication for package mutations", async () => {
    requireCurrentOrganization.mockRejectedValue(new Error("REDIRECT:/login"))
    await expect(setServicePlanActive(null, form({ planId: "plan-a", isActive: "true" }))).rejects.toThrow("REDIRECT:/login")
  })
})