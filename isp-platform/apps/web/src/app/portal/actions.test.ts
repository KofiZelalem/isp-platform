import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPortalAttempts } from "@/lib/portal-security";

const authenticatePap = vi.hoisted(() => vi.fn());
const resolvePublicOrganizationFromRequest = vi.hoisted(() => vi.fn());
const createTenantClient = vi.hoisted(() => vi.fn());
const cookieSet = vi.hoisted(() => vi.fn());
const initializePaystackPayment = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());

vi.mock("radius", () => ({ authenticatePap }));
vi.mock("@/lib/organizations", () => ({ resolvePublicOrganizationFromRequest }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "192.0.2.10" })),
  cookies: vi.fn(async () => ({ set: cookieSet })),
}));
vi.mock("billing", () => ({ redeemVoucher: vi.fn(), VoucherNotRedeemableError: class extends Error {} }));
vi.mock("payments", () => ({ initializePaystackPayment }));
vi.mock("next/navigation", () => ({ redirect }));

const { initializePaymentAction, portalLoginAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("portalLoginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPortalAttempts();
    process.env.PORTAL_AUTH_SECRET = "test-secret";
    resolvePublicOrganizationFromRequest.mockResolvedValue({ id: "org-a", slug: "org-a" });
    createTenantClient.mockReturnValue({});
  });

  it("authenticates through the shared RADIUS PAP service for the resolved tenant", async () => {
    authenticatePap.mockResolvedValue({
      accept: true,
      planName: "Daily",
      sessionTimeoutSec: 3600,
    });

    await expect(
      portalLoginAction(null, form({ organizationSlug: "org-a", username: "alice", password: "secret" }))
    ).resolves.toEqual({ success: true, planName: "Daily", sessionTimeoutSec: 3600 });
    expect(resolvePublicOrganizationFromRequest).toHaveBeenCalledWith("org-a");
    expect(createTenantClient).toHaveBeenCalledWith(expect.anything(), "org-a");
    expect(authenticatePap).toHaveBeenCalledWith(expect.anything(), { username: "alice", password: "secret" });
  });

  it("returns the RADIUS rejection without creating a session or bypassing subscription checks", async () => {
    authenticatePap.mockResolvedValue({ accept: false, reason: "Subscription has expired." });

    await expect(
      portalLoginAction(null, form({ organizationSlug: "org-a", username: "alice", password: "secret" }))
    ).resolves.toEqual({ error: "Subscription has expired." });
  });

  it("rejects an unknown or inactive public organization", async () => {
    resolvePublicOrganizationFromRequest.mockResolvedValue(null);

    await expect(
      portalLoginAction(null, form({ organizationSlug: "unknown", username: "alice", password: "secret" }))
    ).resolves.toEqual({ error: "This hotspot is not available right now." });
    expect(authenticatePap).not.toHaveBeenCalled();
  });
});

describe("initializePaymentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPortalAttempts();
    process.env.PAYSTACK_SECRET_KEY = "sk_test_configured";
    process.env.APP_ORIGIN = "http://localhost:3000";
    resolvePublicOrganizationFromRequest.mockResolvedValue({ id: "org-a", slug: "org-a" });
    createTenantClient.mockReturnValue({
      subscriber: {
        findFirst: vi.fn().mockResolvedValue({ id: "subscriber-a" }),
        create: vi.fn().mockResolvedValue({ id: "subscriber-a" }),
      },
    });
    initializePaystackPayment.mockResolvedValue({ authorizationUrl: "https://paystack.test/checkout" });
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("applies abuse throttling to repeated payment initialization attempts", async () => {
    const data = form({
      organizationSlug: "org-a",
      phone: "024 123 4567",
      planId: "plan-a",
    });

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(initializePaymentAction(null, data)).rejects.toThrow("NEXT_REDIRECT");
    }

    await expect(initializePaymentAction(null, data)).resolves.toEqual({
      error: "Too many attempts. Try again later.",
    });
    expect(initializePaystackPayment).toHaveBeenCalledTimes(5);
    expect(initializePaystackPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      subscriberId: "subscriber-a",
      email: "receipt-233241234567@isp-os.app",
      receiptPhone: "+233241234567",
      callbackUrl: "http://localhost:3000/portal/payment/complete",
    }));
  });
});