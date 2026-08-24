import { beforeEach, describe, expect, it, vi } from "vitest"

const requireCurrentOrganization = vi.hoisted(() => vi.fn())
const updateMany = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ requireCurrentOrganization }))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("database", () => ({ createTenantClient: vi.fn(() => ({ voucher: { updateMany } })) }))
vi.mock("next/cache", () => ({ revalidatePath }))

const { revokeVoucherAction, revokeVoucherBatchAction } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

describe("voucher admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a" })
    updateMany.mockResolvedValue({ count: 1 })
  })

  it("revokes a voucher through the authenticated tenant", async () => {
    await expect(revokeVoucherAction(null, form({ voucherId: "voucher-a", organization_id: "org-b" }))).resolves.toEqual({ success: true })
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "voucher-a", status: { in: ["GENERATED", "SOLD"] } },
      data: { status: "REVOKED" },
    })
  })

  it("revokes only redeemable codes in a tenant batch", async () => {
    await expect(revokeVoucherBatchAction(null, form({ batchId: "batch-a" }))).resolves.toEqual({ success: true })
    expect(updateMany).toHaveBeenCalledWith({
      where: { batch_id: "batch-a", status: { in: ["GENERATED", "SOLD"] } },
      data: { status: "REVOKED" },
    })
  })

  it("rejects unauthenticated revocation", async () => {
    requireCurrentOrganization.mockRejectedValue(new Error("REDIRECT:/login"))
    await expect(revokeVoucherAction(null, form({ voucherId: "voucher-a" }))).rejects.toThrow("REDIRECT:/login")
    expect(updateMany).not.toHaveBeenCalled()
  })
})
