import { describe, expect, it, vi } from "vitest"
import { MockNetworkProvider } from "network"
import type { TenantPrismaClient } from "database"

import { applySubscriptionPolicy } from "./subscription-policy"

type FakeDb = {
  session: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  subscription: { findFirst: ReturnType<typeof vi.fn> }
  networkNode: { update: ReturnType<typeof vi.fn> }
}

function fakeDb(): FakeDb {
  return {
    session: { findMany: vi.fn(), update: vi.fn() },
    subscription: { findFirst: vi.fn() },
    networkNode: { update: vi.fn() },
  }
}

describe("subscription policy provider boundary", () => {
  it("suspends a subscriber through an injected provider", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    db.session.findMany.mockResolvedValue([{
      id: "session-a",
      ip_address: "10.0.0.10",
      started_at: new Date("2026-01-01T00:00:00.000Z"),
      node: { id: "node-a", name: "Router A", organization_id: "org-a", ip_address: "router-a", port: 8728, username_enc: "user", password_enc: "password" },
    }])
    db.session.update.mockResolvedValue({})

    const result = await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "suspend",
      providerFactory: () => provider,
    })

    expect(result).toEqual({ nodesUpdated: 1, errors: [] })
    expect(provider.isolated).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.10" }])
    expect(provider.disconnected).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.10" }])
    expect(db.session.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-a" },
      data: expect.objectContaining({ status: "TERMINATED" }),
    }))
  })

  it("restores a subscriber through the provider without RouterOS calls in policy code", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    db.session.findMany.mockResolvedValue([{
      id: "session-a",
      ip_address: "10.0.0.10",
      started_at: new Date(),
      node: { id: "node-a", name: "Router A", organization_id: "org-a", ip_address: "router-a", port: 8728, username_enc: "user", password_enc: "password" },
    }])
    db.subscription.findFirst.mockResolvedValue({
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      plan: {
        time_limit_minutes: 120,
        speed_upload_kbps: 1024,
        speed_download_kbps: 4096,
      },
    })

    await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "restore",
      providerFactory: () => provider,
    })

    expect(provider.restored).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.10" }])
    expect(provider.ratePolicies).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.10", uploadKbps: 1024, downloadKbps: 4096 }])
    expect(db.session.update).not.toHaveBeenCalled()
  })

  it("terminates sessions that exceeded plan time limits during enforcement", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    const ninetyMinutesAgo = new Date(Date.now() - (90 * 60 * 1000))

    db.session.findMany.mockResolvedValue([{
      id: "session-b",
      ip_address: "10.0.0.20",
      started_at: ninetyMinutesAgo,
      node: { id: "node-b", name: "Router B", organization_id: "org-a", ip_address: "router-b", port: 8728, username_enc: "user", password_enc: "password" },
    }])
    db.subscription.findFirst.mockResolvedValue({
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
      plan: {
        time_limit_minutes: 60,
        speed_upload_kbps: 512,
        speed_download_kbps: 2048,
      },
    })
    db.session.update.mockResolvedValue({})

    const result = await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "enforce",
      providerFactory: () => provider,
    })

    expect(result).toEqual({ nodesUpdated: 1, errors: [] })
    expect(provider.disconnected).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.20" }])
    expect(provider.ratePolicies).toEqual([])
    expect(db.session.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-b" },
      data: expect.objectContaining({ status: "TERMINATED", termination_cause: "Session-Timeout" }),
    }))
  })

  it("applies zero speed rates when suspending a subscriber", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    db.session.findMany.mockResolvedValue([{
      id: "session-c",
      ip_address: "10.0.0.30",
      started_at: new Date(),
      node: { id: "node-c", name: "Router C", organization_id: "org-a", ip_address: "router-c", port: 8728, username_enc: "user", password_enc: "password" },
    }])
    db.session.update.mockResolvedValue({})

    const result = await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "suspend",
      providerFactory: () => provider,
    })

    expect(result).toEqual({ nodesUpdated: 1, errors: [] })
    expect(provider.isolated).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.30" }])
    expect(provider.disconnected).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.30" }])
    // Verify zero speeds are applied during suspend
    expect(provider.ratePolicies).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.30", uploadKbps: 0, downloadKbps: 0 }])
  })

  it("applies plan speed rates when restoring a subscriber", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    db.session.findMany.mockResolvedValue([{
      id: "session-d",
      ip_address: "10.0.0.40",
      started_at: new Date(),
      node: { id: "node-d", name: "Router D", organization_id: "org-a", ip_address: "router-d", port: 8728, username_enc: "user", password_enc: "password" },
    }])
    db.subscription.findFirst.mockResolvedValue({
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      plan: {
        time_limit_minutes: 120,
        speed_upload_kbps: 2048,
        speed_download_kbps: 8192,
      },
    })

    const result = await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "restore",
      providerFactory: () => provider,
    })

    expect(result).toEqual({ nodesUpdated: 1, errors: [] })
    expect(provider.restored).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.40" }])
    expect(provider.ratePolicies).toEqual([{ subscriberId: "subscriber-a", address: "10.0.0.40", uploadKbps: 2048, downloadKbps: 8192 }])
  })

  it("skips sessions with missing IP addresses", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    db.session.findMany.mockResolvedValue([{
      id: "session-e",
      ip_address: null,
      started_at: new Date(),
      node: { id: "node-e", name: "Router E", organization_id: "org-a", ip_address: "router-e", port: 8728, username_enc: "user", password_enc: "password" },
    }])

    const result = await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "restore",
      providerFactory: () => provider,
    })

    // Should report error and nodesUpdated=0 when session IP is missing
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("Session IP address is missing")
  })

  it("rejects invalid plan policy (negative speeds)", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    db.session.findMany.mockResolvedValue([{
      id: "session-f",
      ip_address: "10.0.0.50",
      started_at: new Date(),
      node: { id: "node-f", name: "Router F", organization_id: "org-a", ip_address: "router-f", port: 8728, username_enc: "user", password_enc: "password" },
    }])
    db.subscription.findFirst.mockResolvedValue({
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      plan: {
        time_limit_minutes: 120,
        speed_upload_kbps: -100, // Invalid!
        speed_download_kbps: 1024,
      },
    })

    const result = await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "restore",
      providerFactory: () => provider,
    })

    expect(result.nodesUpdated).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("Invalid upload speed")
  })

  it("rejects invalid plan policy (zero session timeout)", async () => {
    const db = fakeDb()
    const provider = new MockNetworkProvider()
    db.session.findMany.mockResolvedValue([{
      id: "session-g",
      ip_address: "10.0.0.60",
      started_at: new Date(),
      node: { id: "node-g", name: "Router G", organization_id: "org-a", ip_address: "router-g", port: 8728, username_enc: "user", password_enc: "password" },
    }])
    db.subscription.findFirst.mockResolvedValue({
      expires_at: new Date(Date.now() - 60 * 60 * 1000), // Already expired!
      plan: {
        time_limit_minutes: null,
        speed_upload_kbps: 1024,
        speed_download_kbps: 4096,
      },
    })

    const result = await applySubscriptionPolicy(db as unknown as TenantPrismaClient, {
      subscriberId: "subscriber-a",
      action: "restore",
      providerFactory: () => provider,
    })

    expect(result.nodesUpdated).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("Invalid session timeout")
  })
})
