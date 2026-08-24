import { describe, expect, it, vi } from "vitest"

const verifyPapPassword = vi.hoisted(() => vi.fn(async () => true))
vi.mock("./pap", () => ({ verifyPapPassword }))

import { authenticateChap, authenticateMsChapV2, authenticatePap } from "./auth"

describe("RADIUS protocol validation", () => {
  it("rejects malformed CHAP requests before database access", async () => {
    const result = await authenticateChap({} as never, {
      username: "alice",
      chapIdentifier: 1,
      chapChallenge: Buffer.alloc(0),
      chapResponse: Buffer.alloc(15),
    })
    expect(result).toEqual({ accept: false, reason: "Malformed CHAP request." })
  })

  it("rejects malformed MS-CHAPv2 requests before database access", async () => {
    const result = await authenticateMsChapV2({} as never, {
      username: "alice",
      authenticatorChallenge: Buffer.alloc(15),
      peerChallenge: Buffer.alloc(16),
      ntResponse: Buffer.alloc(24),
    })
    expect(result).toEqual({ accept: false, reason: "Malformed MS-CHAPv2 request." })
  })

  it("returns plan-backed RADIUS reply attributes for an authorized customer", async () => {
    const tenantDb = {
      subscriber: { findFirst: vi.fn()
        .mockResolvedValueOnce({ password_hash: "hash" })
        .mockResolvedValueOnce({
          id: "subscriber-a",
          status: "ACTIVE",
          subscriptions: [{
            id: "subscription-a",
            expires_at: new Date(Date.now() + 86_400_000),
            data_used_mb: 0,
            plan: {
              name: "Weekly",
              data_limit_mb: 20480,
              time_limit_minutes: 120,
              speed_upload_kbps: 1024,
              speed_download_kbps: 4096,
              radius_group: "weekly-users",
              mikrotik_profile: "weekly-profile",
            },
          }],
        }) },
      subscription: { update: vi.fn() },
    }

    const result = await authenticatePap(tenantDb as never, { username: "alice", password: "secret" })
    expect(result).toMatchObject({
      accept: true,
      sessionTimeoutSec: 7200,
      replyAttributes: {
        "Session-Timeout": "7200",
        "User-Group": "weekly-users",
        "Mikrotik-Group": "weekly-profile",
        "Mikrotik-Rate-Limit": "1024k/4096k",
      },
    })
  })
})
