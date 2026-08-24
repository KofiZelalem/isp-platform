import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCurrentOrganization = vi.hoisted(() => vi.fn());
const createTenantClient = vi.hoisted(() => vi.fn());
const sendConfiguredNotification = vi.hoisted(() => vi.fn());
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/auth", () => ({ requireCurrentOrganization }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/api/configured-notifications", () => ({ sendConfiguredNotification }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { testNotificationProviderAction } = await import("./test-notification-action");

describe("notification provider test action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCurrentOrganization.mockResolvedValue({ organizationId: "org-a", userId: "user-a" });
    createTenantClient.mockReturnValue({ user: { findUnique: vi.fn().mockResolvedValue({ email: "admin@example.test", phone: "+15555555555" }) } });
    sendConfiguredNotification.mockResolvedValue({ id: "n1", status: "SENT" });
  });

  it("sends an email test using the authenticated admin recipient", async () => {
    const form = new FormData();
    form.set("channel", "EMAIL");
    await expect(testNotificationProviderAction(null, form)).resolves.toEqual({ success: true });
    expect(sendConfiguredNotification).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", userId: "user-a", channel: "EMAIL", email: "admin@example.test" }));
  });

  it("uses an entered Ghana number for an SMS test", async () => {
    const form = new FormData();
    form.set("channel", "SMS");
    form.set("phone", "024 123 4567");
    await expect(testNotificationProviderAction(null, form)).resolves.toEqual({ success: true });
    expect(sendConfiguredNotification).toHaveBeenCalledWith(expect.objectContaining({ channel: "SMS", phone: "+233241234567" }));
  });

  it("rejects invalid channels and reports provider failures", async () => {
    const invalid = new FormData();
    invalid.set("channel", "WEBHOOK");
    await expect(testNotificationProviderAction(null, invalid)).resolves.toEqual({ error: "Select a valid notification channel." });

    sendConfiguredNotification.mockResolvedValue({ id: "n2", status: "FAILED", providerError: "provider unavailable" });
    const sms = new FormData();
    sms.set("channel", "SMS");
    await expect(testNotificationProviderAction(null, sms)).resolves.toEqual({ error: "provider unavailable" });
  });
});
