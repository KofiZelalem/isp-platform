import { afterEach, describe, expect, it } from "vitest";

import {
  buildPortalNasHandoff,
  consumePortalAttempt,
  createPortalAuthState,
  readPortalAuthState,
  resolvePortalRedirectDestination,
  resetPortalAttempts,
  safePortalDestination,
  verifyPortalAuthState,
} from "./portal-security";

describe("portal security", () => {
  afterEach(() => {
    resetPortalAttempts();
    delete process.env.PORTAL_AUTH_SECRET;
  });

  it("creates and verifies tenant-scoped signed state without credentials", () => {
    process.env.PORTAL_AUTH_SECRET = "test-secret";
    const token = createPortalAuthState({
      organizationId: "org-a",
      subscriberId: "subscriber-a",
      subscriptionId: "subscription-a",
      destination: "/welcome?from=hotspot",
    }, 1_000);

    expect(verifyPortalAuthState(token, 1_000)).toMatchObject({ organizationId: "org-a", subscriberId: "subscriber-a" });
    expect(verifyPortalAuthState(`${token}tampered`, 1_000)).toBeNull();
    expect(verifyPortalAuthState(token, 3_601_001)).toBeNull();
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(safePortalDestination("https://evil.test")).toBe("/portal");
    expect(safePortalDestination("//evil.test")).toBe("/portal");
    expect(safePortalDestination("/connected?dst=%2Fhome")).toBe("/connected?dst=%2Fhome");
  });

  it("reads only valid tenant-scoped auth cookies", () => {
    process.env.PORTAL_AUTH_SECRET = "test-secret";
    const token = createPortalAuthState({
      organizationId: "org-a",
      subscriberId: "subscriber-a",
      subscriptionId: "subscription-a",
      destination: "/connected?dst=%2Fhome",
    }, 1_000);

    expect(readPortalAuthState(token, "org-a", 1_000)).toMatchObject({ organizationId: "org-a" });
    expect(readPortalAuthState(token, "org-b", 1_000)).toBeNull();
    expect(readPortalAuthState(`${token}tampered`, "org-a", 1_000)).toBeNull();
  });

  it("builds NAS handoff fields from an allowlisted sanitized set", () => {
    expect(
      buildPortalNasHandoff({
        destination: "https://evil.test",
        linkOrig: "/status?id=1",
        linkLoginOnly: "http://192.168.88.1/login",
        chapId: "19",
        chapChallenge: "a0b1c2d3",
        mac: "AA:BB:CC:DD:EE:FF",
        ip: "192.0.2.15",
      })
    ).toEqual({
      destination: "/portal",
      linkOrig: "/status?id=1",
      linkLoginOnly: "http://192.168.88.1/login",
      chapId: "19",
      chapChallenge: "a0b1c2d3",
      mac: "AA:BB:CC:DD:EE:FF",
      ip: "192.0.2.15",
    });

    expect(
      buildPortalNasHandoff({
        destination: "/ok",
        linkOrig: "first\nsecond",
        chapId: "999",
        chapChallenge: "not-hex",
        mac: "invalid",
        ip: "not-an-ip",
      })
    ).toEqual({
      destination: "/ok",
      linkOrig: null,
      linkLoginOnly: null,
      chapId: null,
      chapChallenge: null,
      mac: null,
      ip: null,
    });
  });

  it("redirects /portal auth state to connected evidence route", () => {
    expect(resolvePortalRedirectDestination("/portal")).toBe("/portal/connected");
    expect(resolvePortalRedirectDestination("https://evil.test")).toBe("/portal/connected");
    expect(resolvePortalRedirectDestination("/connected?dst=%2Fhome")).toBe("/connected?dst=%2Fhome");
  });

  it("limits attempts by both IP and identifier", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(consumePortalAttempt("192.0.2.10", "alice")).resolves.toBe(true);
    }
    await expect(consumePortalAttempt("192.0.2.10", "alice")).resolves.toBe(false);
    await expect(consumePortalAttempt("192.0.2.11", "alice")).resolves.toBe(false);
  });
});