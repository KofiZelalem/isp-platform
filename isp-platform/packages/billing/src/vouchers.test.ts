import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TenantPrismaClient } from "database"

const assignPlanToSubscriber = vi.hoisted(() => vi.fn())
const activateSubscription = vi.hoisted(() => vi.fn())
const processResellerCommission = vi.hoisted(() => vi.fn())

vi.mock("./subscriptions", () => ({ assignPlanToSubscriber, activateSubscription }))
vi.mock("./resellers", () => ({ processResellerCommission }))

import { VoucherNotRedeemableError, generateVoucherCode, redeemVoucher } from "./vouchers"

type FakeVoucherDb = {
  voucher: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  subscriber: { upsert: ReturnType<typeof vi.fn> }
  voucherUse: { create: ReturnType<typeof vi.fn> }
}

function fakeDb(): FakeVoucherDb {
  return {
    voucher: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    subscriber: { upsert: vi.fn() },
    voucherUse: { create: vi.fn() },
  }
}

describe("voucher engine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assignPlanToSubscriber.mockResolvedValue({ id: "subscription-a" })
    activateSubscription.mockResolvedValue({ id: "subscription-a", expires_at: new Date("2026-08-28T00:00:00.000Z") })
  })

  it("generates printable codes without ambiguous characters", () => {
    const code = generateVoucherCode(20)
    expect(code).toHaveLength(20)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/)
  })

  it("rejects a concurrent redemption after another request claims the code", async () => {
    const db = fakeDb()
    db.voucher.findFirst.mockResolvedValue({ id: "voucher-a", status: "GENERATED", expires_at: null, batch: { plan_id: "plan-a", plan: { name: "Weekly" } } })
    db.voucher.updateMany.mockResolvedValue({ count: 0 })

    await expect(redeemVoucher(db as unknown as TenantPrismaClient, {
      organizationId: "org-a",
      code: "NEXA-ABC12345",
      subscriberUsername: "guest-device",
      subscriberFullName: "Guest Device",
    })).rejects.toBeInstanceOf(VoucherNotRedeemableError)
    expect(db.subscriber.upsert).not.toHaveBeenCalled()
    expect(assignPlanToSubscriber).not.toHaveBeenCalled()
  })

  it("claims, activates, and records a single-use voucher", async () => {
    const db = fakeDb()
    db.voucher.findFirst.mockResolvedValue({ id: "voucher-a", status: "GENERATED", expires_at: null, batch: { plan_id: "plan-a", plan: { name: "Weekly" } } })
    db.voucher.updateMany.mockResolvedValue({ count: 1 })
    db.subscriber.upsert.mockResolvedValue({ id: "subscriber-a" })
    db.voucher.update.mockResolvedValue({})
    db.voucherUse.create.mockResolvedValue({ id: "use-a" })

    await expect(redeemVoucher(db as unknown as TenantPrismaClient, {
      organizationId: "org-a",
      code: "NEXA-ABC12345",
      subscriberUsername: "guest-device",
      subscriberFullName: "Guest Device",
    })).resolves.toEqual({ subscriberId: "subscriber-a", accessUsername: "guest-device", accessPassword: "NEXA-ABC12345", subscriptionId: "subscription-a", planName: "Weekly", expiresAt: new Date("2026-08-28T00:00:00.000Z") })
    expect(db.voucher.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "voucher-a", status: { in: ["GENERATED", "SOLD"] } } }))
    expect(activateSubscription).toHaveBeenCalled()
    expect(db.voucherUse.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: "org-a", voucher_id: "voucher-a" }) }))
  })
})
