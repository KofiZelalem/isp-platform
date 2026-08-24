import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TenantPrismaClient } from "database"

const activateSubscription = vi.hoisted(() => vi.fn())
vi.mock("billing", () => ({ activateSubscription }))

import { PaymentSettlementError, failPaystackPayment, settlePaystackPayment } from "payments"

type FakeDb = {
  payment: {
    findUnique: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}

function fakeDb(): FakeDb {
  return { payment: { findUnique: vi.fn(), updateMany: vi.fn() } }
}

function asTenantDb(db: FakeDb) {
  return db as unknown as TenantPrismaClient
}

const pendingPayment = {
  id: "payment-a",
  status: "PENDING",
  amount: 40,
  currency: "GHS",
  subscription_id: "subscription-a",
  subscription: { id: "subscription-a", status: "PENDING" },
}

describe("payment settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activateSubscription.mockResolvedValue({ id: "subscription-a", status: "ACTIVE" })
  })

  it("rejects an amount or currency that differs from the stored billing record", async () => {
    const db = fakeDb()
    db.payment.findUnique.mockResolvedValue(pendingPayment)
    await expect(settlePaystackPayment(asTenantDb(db), {
      internalReference: "payment-ref",
      providerReference: "paystack-ref",
      amountSmallestUnit: 1,
      currency: "USD",
    })).rejects.toBeInstanceOf(PaymentSettlementError)
    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(activateSubscription).not.toHaveBeenCalled()
  })

  it("claims a pending payment once and activates its linked subscription", async () => {
    const db = fakeDb()
    db.payment.findUnique.mockResolvedValue(pendingPayment)
    db.payment.updateMany.mockResolvedValue({ count: 1 })
    const paidAt = new Date("2026-08-21T12:00:00.000Z")

    await expect(settlePaystackPayment(asTenantDb(db), {
      internalReference: "payment-ref",
      providerReference: "paystack-ref",
      amountSmallestUnit: 4000,
      currency: "GHS",
      paidAt,
    })).resolves.toEqual({ paymentId: "payment-a", alreadySettled: false })
    expect(db.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-a", status: "PENDING" },
      data: expect.objectContaining({ status: "SUCCESS", provider_ref: "paystack-ref" }),
    }))
    expect(activateSubscription).toHaveBeenCalledWith(expect.anything(), "subscription-a", paidAt)
  })

  it("does not activate when another webhook already claimed the payment", async () => {
    const db = fakeDb()
    db.payment.findUnique.mockResolvedValue(pendingPayment)
    db.payment.updateMany.mockResolvedValue({ count: 0 })

    await expect(settlePaystackPayment(asTenantDb(db), {
      internalReference: "payment-ref",
      providerReference: "paystack-ref",
      amountSmallestUnit: 4000,
      currency: "GHS",
    })).resolves.toEqual({ paymentId: "payment-a", alreadySettled: true })
    expect(activateSubscription).not.toHaveBeenCalled()
  })

  it("records a failed payment without activating its subscription", async () => {
    const db = fakeDb()
    db.payment.updateMany.mockResolvedValue({ count: 1 })
    await expect(failPaystackPayment(asTenantDb(db), {
      internalReference: "payment-ref",
      reason: "Insufficient funds",
    })).resolves.toEqual({ failed: true })
    expect(db.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { internal_reference: "payment-ref", status: "PENDING" },
      data: expect.objectContaining({ status: "FAILED", failure_reason: "Insufficient funds" }),
    }))
    expect(activateSubscription).not.toHaveBeenCalled()
  })
})
