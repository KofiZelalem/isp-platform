import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({ organization: { findMany: vi.fn() } }));
const createTenantClient = vi.hoisted(() => vi.fn());
const sendConfiguredNotification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/api/configured-notifications", () => ({ sendConfiguredNotification }));

const { deliverCustomerReminders } = await import("./customer-reminder-delivery");

describe("customer reminder delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findMany.mockResolvedValue([{ id: "org-a", name: "ISP A" }]);
    sendConfiguredNotification.mockResolvedValue({ id: "notification-a", status: "SENT" });
  });

  it("sends a low-data SMS once for an active package", async () => {
    const tenantDb = {
      subscription: {
        findMany: vi.fn().mockResolvedValue([{ id: "subscription-a", expires_at: new Date("2026-08-25T18:00:00.000Z"), data_used_mb: 850, subscriber: { full_name: "Ama", phone: "+233241234567" }, plan: { name: "Weekly", data_limit_mb: 1000 } }]),
        updateMany: vi.fn(),
      },
      notification: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    createTenantClient.mockReturnValue(tenantDb);

    await expect(deliverCustomerReminders(new Date("2026-08-24T18:00:00.000Z"))).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ subscriptionId: "subscription-a", reminder: "LOW_DATA", status: "SENT" }),
    ]));
    expect(sendConfiguredNotification).toHaveBeenCalledWith(expect.objectContaining({ channel: "SMS", phone: "+233241234567", subject: "customer-reminder:LOW_DATA:subscription-a" }));
  });

  it("expires access after sending the expiry notice", async () => {
    const tenantDb = {
      subscription: {
        findMany: vi.fn().mockResolvedValue([{ id: "subscription-a", expires_at: new Date("2026-08-23T18:00:00.000Z"), data_used_mb: 0, subscriber: { full_name: "Ama", phone: "+233241234567" }, plan: { name: "Weekly", data_limit_mb: 1000 } }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    createTenantClient.mockReturnValue(tenantDb);

    await deliverCustomerReminders(new Date("2026-08-24T18:00:00.000Z"));
    expect(sendConfiguredNotification).toHaveBeenCalledWith(expect.objectContaining({ subject: "customer-reminder:EXPIRED:subscription-a" }));
    expect(tenantDb.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "EXPIRED" } }));
  });
});