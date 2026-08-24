import { beforeEach, describe, expect, it, vi } from "vitest"
import { PaymentProviderError } from "payments"

const assignPlanToSubscriber = vi.hoisted(() => vi.fn())
const createTenantClient = vi.hoisted(() => vi.fn())

vi.mock("billing", () => ({ assignPlanToSubscriber }))
vi.mock("database", () => ({ createTenantClient }))

const { initializePaystackPayment } = await import("payments/src/initialize")

const fetchPaystack = vi.hoisted(() => vi.fn())
vi.stubGlobal("fetch", fetchPaystack)

type FakeDb = {
  servicePlan: { findUnique: ReturnType<typeof vi.fn> }
  subscriber: { findUnique: ReturnType<typeof vi.fn> }
  payment: { create: ReturnType<typeof vi.fn> }
}

function fakeDb(): FakeDb {
  return {
    servicePlan: { findUnique: vi.fn() },
    subscriber: { findUnique: vi.fn() },
    payment: { create: vi.fn() },
  }
}

describe("payment initiation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchPaystack.mockResolvedValue({
      ok: true,
      statusText: "OK",
      json: async () => ({ status: true, data: { authorization_url: "https://paystack.test/checkout", access_code: "access", reference: "payment-ref" } }),
    })
    assignPlanToSubscriber.mockResolvedValue({ id: "subscription-a" })
  })

  it("uses tenant-owned customer/package data and server-side plan price/currency", async () => {
    const db = fakeDb()
    db.servicePlan.findUnique.mockResolvedValue({ price: 40, name: "Weekly", is_active: true, organization: { currency: "GHS" } })
    db.subscriber.findUnique.mockResolvedValue({ id: "customer-a" })
    createTenantClient.mockReturnValue(db)

    const result = await initializePaystackPayment({} as never, {
      organizationId: "org-a",
      subscriberId: "customer-a",
      planId: "plan-a",
      email: "ama@example.com",
      secretKey: "sk_test_key",
    })

    expect(result.authorizationUrl).toBe("https://paystack.test/checkout")
    expect(assignPlanToSubscriber).toHaveBeenCalledWith(db, { subscriberId: "customer-a", planId: "plan-a" })
    expect(db.payment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organization_id: "org-a", amount: 40, currency: "GHS", subscription_id: "subscription-a", status: "PENDING" }),
    }))
    expect(fetchPaystack).toHaveBeenCalledWith("https://api.paystack.co/transaction/initialize", expect.objectContaining({
      body: expect.stringContaining('"amount":4000'),
    }))
  })

  it("rejects a customer from another tenant before creating a payment", async () => {
    const db = fakeDb()
    db.servicePlan.findUnique.mockResolvedValue({ price: 40, name: "Weekly", is_active: true, organization: { currency: "GHS" } })
    db.subscriber.findUnique.mockResolvedValue(null)
    createTenantClient.mockReturnValue(db)

    await expect(initializePaystackPayment({} as never, {
      organizationId: "org-a",
      subscriberId: "customer-b",
      planId: "plan-a",
      email: "ama@example.com",
      secretKey: "sk_test_key",
    })).rejects.toThrow("Customer not found in this organization")
    expect(db.payment.create).not.toHaveBeenCalled()
    expect(fetchPaystack).not.toHaveBeenCalled()
  })

  it("rejects inactive packages and unsupported currency", async () => {
    const db = fakeDb()
    db.servicePlan.findUnique.mockResolvedValue({ price: 40, name: "Old", is_active: false, organization: { currency: "GHS" } })
    db.subscriber.findUnique.mockResolvedValue({ id: "customer-a" })
    createTenantClient.mockReturnValue(db)
    await expect(initializePaystackPayment({} as never, { organizationId: "org-a", subscriberId: "customer-a", planId: "old", email: "a@example.com", secretKey: "key" })).rejects.toThrow("inactive")

    db.servicePlan.findUnique.mockResolvedValue({ price: 40, name: "Weekly", is_active: true, organization: { currency: "USD" } })
    await expect(initializePaystackPayment({} as never, { organizationId: "org-a", subscriberId: "customer-a", planId: "plan-a", email: "a@example.com", secretKey: "key" })).rejects.toThrow("supports GHS")
  })

  it("does not create local subscription or payment records when provider initialization fails", async () => {
    const db = fakeDb()
    db.servicePlan.findUnique.mockResolvedValue({ price: 40, name: "Weekly", is_active: true, organization: { currency: "GHS" } })
    db.subscriber.findUnique.mockResolvedValue({ id: "customer-a" })
    createTenantClient.mockReturnValue(db)
    fetchPaystack.mockRejectedValue(new Error("provider unavailable"))

    await expect(initializePaystackPayment({} as never, {
      organizationId: "org-a",
      subscriberId: "customer-a",
      planId: "plan-a",
      email: "ama@example.com",
      secretKey: "sk_test_key",
    })).rejects.toBeInstanceOf(PaymentProviderError)
    expect(assignPlanToSubscriber).not.toHaveBeenCalled()
    expect(db.payment.create).not.toHaveBeenCalled()
  })
})
