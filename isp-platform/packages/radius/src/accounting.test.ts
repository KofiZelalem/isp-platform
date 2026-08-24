import { describe, expect, it, vi } from "vitest"
import type { TenantPrismaClient } from "database"

import { handleAccountingStart, handleAccountingUpdate } from "./accounting"

type FakeDb = {
  subscriber: { findUnique: ReturnType<typeof vi.fn> }
  networkNode: { findUnique: ReturnType<typeof vi.fn> }
  session: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
}

function fakeDb(): FakeDb {
  return {
    subscriber: { findUnique: vi.fn() },
    networkNode: { findUnique: vi.fn() },
    session: { findFirst: vi.fn(), create: vi.fn() },
  }
}

describe("RADIUS accounting", () => {
  it("rejects a subscriber from another tenant before creating a session", async () => {
    const db = fakeDb()
    db.subscriber.findUnique.mockResolvedValue(null)
    db.networkNode.findUnique.mockResolvedValue({ id: "node-a" })
    db.session.findFirst.mockResolvedValue(null)

    await expect(handleAccountingStart(db as unknown as TenantPrismaClient, {
      organizationId: "org-a",
      subscriberId: "subscriber-b",
      nodeId: "node-a",
      radiusSessionId: "acct-1",
    })).rejects.toThrow("Subscriber was not found in this organization")
    expect(db.session.create).not.toHaveBeenCalled()
  })

  it("rejects a network node from another tenant before creating a session", async () => {
    const db = fakeDb()
    db.subscriber.findUnique.mockResolvedValue({ id: "subscriber-a" })
    db.networkNode.findUnique.mockResolvedValue(null)
    db.session.findFirst.mockResolvedValue(null)

    await expect(handleAccountingStart(db as unknown as TenantPrismaClient, {
      organizationId: "org-a",
      subscriberId: "subscriber-a",
      nodeId: "node-b",
      radiusSessionId: "acct-1",
    })).rejects.toThrow("Network node was not found in this organization")
    expect(db.session.create).not.toHaveBeenCalled()
  })

  it("returns an existing session for a duplicate accounting start", async () => {
    const db = fakeDb()
    const existing = { id: "session-a", status: "ACTIVE" }
    db.subscriber.findUnique.mockResolvedValue({ id: "subscriber-a" })
    db.networkNode.findUnique.mockResolvedValue({ id: "node-a" })
    db.session.findFirst.mockResolvedValue(existing)

    await expect(handleAccountingStart(db as unknown as TenantPrismaClient, {
      organizationId: "org-a",
      subscriberId: "subscriber-a",
      nodeId: "node-a",
      radiusSessionId: "acct-1",
    })).resolves.toBe(existing)
    expect(db.session.create).not.toHaveBeenCalled()
  })

  it("rejects invalid accounting counters before database access", async () => {
    const db = fakeDb()
    const result = await handleAccountingUpdate(db as unknown as TenantPrismaClient, {
      radiusSessionId: "acct-1",
      dataUpMb: -1,
      dataDownMb: 0,
      durationSec: 0,
    })
    expect(result).toEqual({ action: "disconnect", reason: "Accounting counters must be non-negative whole numbers." })
    expect(db.session.findFirst).not.toHaveBeenCalled()
  })
})
