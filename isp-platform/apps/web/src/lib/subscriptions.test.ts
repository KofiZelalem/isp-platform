import { describe, expect, it, vi } from "vitest"
import { activateSubscription, assignPlanToSubscriber, expireSubscriptions } from "billing"
import type { TenantPrismaClient } from "database"

type FakeSubscriptionDb = {
  servicePlan: { findUnique: ReturnType<typeof vi.fn> }
  subscriber: { findUnique: ReturnType<typeof vi.fn> }
  subscription: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}

function tenantDb() {
  return {
    servicePlan: { findUnique: vi.fn() },
    subscriber: { findUnique: vi.fn() },
    subscription: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  } satisfies FakeSubscriptionDb
}

describe("subscription engine", () => {
  it("rejects a cross-tenant customer before creating a subscription", async () => {
    const db = tenantDb()
    db.servicePlan.findUnique.mockResolvedValue({ id: "plan-a", organization_id: "org-a", is_active: true, validity_days: 7 })
    db.subscriber.findUnique.mockResolvedValue(null)
    await expect(assignPlanToSubscriber(db as unknown as TenantPrismaClient, { subscriberId: "customer-b", planId: "plan-a" })).rejects.toThrow("does not exist in this organization")
    expect(db.subscription.create).not.toHaveBeenCalled()
  })

  it("creates a pending subscription and activates it with package expiry", async () => {
    const db = tenantDb()
    const startedAt = new Date("2026-01-01T14:00:00.000Z")
    db.servicePlan.findUnique.mockResolvedValue({ id: "plan-a", organization_id: "org-a", is_active: true, validity_days: 7 })
    db.subscriber.findUnique.mockResolvedValue({ id: "customer-a" })
    db.subscription.create.mockResolvedValue({ id: "subscription-a", status: "PENDING" })
    db.subscription.findUnique.mockResolvedValue({ id: "subscription-a", status: "PENDING", plan: { validity_days: 7 } })
    db.subscription.update.mockResolvedValue({ id: "subscription-a", status: "ACTIVE" })

    const pending = await assignPlanToSubscriber(db as unknown as TenantPrismaClient, { subscriberId: "customer-a", planId: "plan-a" })
    expect(db.subscription.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", organization_id: "org-a" }) }))
    await activateSubscription(db as unknown as TenantPrismaClient, pending.id, startedAt)
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE", expires_at: new Date("2026-01-08T14:00:00.000Z") }) }))
  })

  it("expires active subscriptions through a server-side timestamp", async () => {
    const db = tenantDb()
    db.subscription.updateMany.mockResolvedValue({ count: 2 })
    const now = new Date("2026-01-10T00:00:00.000Z")
    await expect(expireSubscriptions(db as unknown as TenantPrismaClient, now)).resolves.toEqual({ count: 2 })
    expect(db.subscription.updateMany).toHaveBeenCalledWith({ where: { status: "ACTIVE", expires_at: { lte: now } }, data: { status: "EXPIRED" } })
  })
})