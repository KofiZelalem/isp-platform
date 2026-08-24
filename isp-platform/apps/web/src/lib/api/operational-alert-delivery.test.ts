import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({ organization: { findMany: vi.fn() } }));
const createTenantClient = vi.hoisted(() => vi.fn());
const getAlerts = vi.hoisted(() => vi.fn());
const sendNotification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/api/sessions", () => ({ getSessionOperationalAlertsForOrganization: getAlerts }));
vi.mock("notifications", () => ({ sendNotification }));
vi.mock("@/lib/api/configured-notifications", () => ({ sendConfiguredNotification: sendNotification }));

const { deliverOperationalAlerts } = await import("./operational-alert-delivery");

describe("operational alert delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findMany.mockResolvedValue([{ id: "org-a", name: "ISP A" }]);
    getAlerts.mockResolvedValue([{ key: "long-active", message: "Long sessions", count: 2 }]);
    sendNotification.mockResolvedValue({ id: "notification-a", status: "SENT" });
  });

  it("creates an in-app alert for tenant staff", async () => {
    const tenantDb = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: "user-a", email: "admin@example.test" }]) },
      notification: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    createTenantClient.mockReturnValue(tenantDb);
    await expect(deliverOperationalAlerts(new Date("2026-08-23T12:00:00.000Z"))).resolves.toEqual([
      { organizationId: "org-a", alertKey: "long-active", status: "SENT" },
    ]);
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", userId: "user-a", channel: "IN_APP" }));
  });

  it("deduplicates an alert within the delivery window", async () => {
    const tenantDb = {
      user: { findMany: vi.fn() },
      notification: { findFirst: vi.fn().mockResolvedValue({ id: "existing" }) },
    };
    createTenantClient.mockReturnValue(tenantDb);
    await expect(deliverOperationalAlerts()).resolves.toEqual([
      { organizationId: "org-a", alertKey: "long-active", status: "SKIPPED", notificationId: "existing" },
    ]);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("records failure when every staff delivery fails without throwing", async () => {
    const tenantDb = {
      user: { findMany: vi.fn().mockResolvedValue([{ id: "user-a", email: "admin@example.test" }]) },
      notification: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    createTenantClient.mockReturnValue(tenantDb);
    sendNotification.mockResolvedValue({ id: "notification-a", status: "FAILED", providerError: "provider down" });
    await expect(deliverOperationalAlerts()).resolves.toEqual([
      { organizationId: "org-a", alertKey: "long-active", status: "FAILED", error: "provider down" },
    ]);
  });
});
