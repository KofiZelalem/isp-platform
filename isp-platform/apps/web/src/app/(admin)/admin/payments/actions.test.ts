import { beforeEach, describe, expect, it, vi } from "vitest"

const requireCurrentOrganization = vi.hoisted(() => vi.fn())
const initializePaystackPayment = vi.hoisted(() => vi.fn())
const findUnique = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ requireCurrentOrganization }))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("database", () => ({ createTenantClient: vi.fn(() => ({ subscriber: { findUnique } })) }))
vi.mock("payments", () => ({ initializePaystackPayment }))

const { initializeAdminPaymentAction } = await import("./actions")

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

describe("initializeAdminPaymentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PAYSTACK_SECRET_KEY = "sk_test_key"
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a" })
    findUnique.mockResolvedValue({ email: "customer@example.com" })
    initializePaystackPayment.mockResolvedValue({ authorizationUrl: "https://checkout.test" })
  })

  it("derives tenant and customer email server-side", async () => {
    await expect(initializeAdminPaymentAction(null, form({ subscriberId: "customer-a", planId: "plan-a", organization_id: "org-b", email: "attacker@example.com" }))).resolves.toEqual({ success: true, authorizationUrl: "https://checkout.test" })
    expect(initializePaystackPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: "org-a", subscriberId: "customer-a", planId: "plan-a", email: "customer@example.com" }))
  })

  it("rejects unauthenticated billing initiation", async () => {
    requireCurrentOrganization.mockRejectedValue(new Error("REDIRECT:/login"))
    await expect(initializeAdminPaymentAction(null, form({ subscriberId: "customer-a", planId: "plan-a" }))).rejects.toThrow("REDIRECT:/login")
    expect(initializePaystackPayment).not.toHaveBeenCalled()
  })
})
