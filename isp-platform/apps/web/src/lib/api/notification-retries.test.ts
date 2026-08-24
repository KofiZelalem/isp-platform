import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const sendConfiguredNotification = vi.hoisted(() => vi.fn());
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/api/configured-notifications", () => ({ sendConfiguredNotification }));

const { retryFailedNotification } = await import("./notification-retries");

function buildClient(notification: unknown) {
  return {
    notification: {
      findFirst: vi.fn().mockResolvedValue(notification),
      update: vi.fn().mockResolvedValue({ id: "original", retry_count: 3 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ email: "admin@example.test" }) },
    subscriber: { findUnique: vi.fn().mockResolvedValue({ email: "subscriber@example.test", phone: "+15555555555" }) },
  };
}

const original = {
  id: "original",
  type: "GENERAL",
  channel: "EMAIL",
  message: "Router failed",
  subject: "Alert",
  user_id: "user-a",
  subscriber_id: null,
  retry_count: 2,
};

describe("notification retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendConfiguredNotification.mockResolvedValue({ id: "retry-3", status: "SENT" });
  });

  it("creates a linked retry with the next attempt number", async () => {
    const tenantDb = buildClient(original);
    createTenantClient.mockReturnValue(tenantDb);
    await expect(retryFailedNotification("org-a", "original")).resolves.toEqual({ originalId: "original", retryId: "retry-3", status: "SENT", attempt: 3 });
    expect(tenantDb.notification.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "original" }, data: expect.objectContaining({ retry_count: { increment: 1 } }), select: { retry_count: true } }));
    expect(sendConfiguredNotification).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", retryOfId: "original", email: "admin@example.test" }));
  });

  it("rejects missing, non-failed, and cross-tenant notifications", async () => {
    await expect(retryFailedNotification("org-a", " ")).rejects.toThrow("Notification id is required");
    createTenantClient.mockReturnValue(buildClient(null));
    await expect(retryFailedNotification("org-a", "foreign")).rejects.toThrow("Failed notification not found");
    expect(sendConfiguredNotification).not.toHaveBeenCalled();
  });

  it("reports provider failure as a failed retry without changing the original result", async () => {
    const tenantDb = buildClient(original);
    createTenantClient.mockReturnValue(tenantDb);
    sendConfiguredNotification.mockResolvedValue({ id: "retry-3", status: "FAILED", providerError: "provider unavailable" });
    await expect(retryFailedNotification("org-a", "original")).resolves.toMatchObject({ originalId: "original", retryId: "retry-3", status: "FAILED", attempt: 3, error: "provider unavailable" });
  });
});
