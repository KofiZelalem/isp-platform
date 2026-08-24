import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.hoisted(() => vi.fn());
const createTenantClient = vi.hoisted(() => vi.fn());
const assignPlanToSubscriber = vi.hoisted(() => vi.fn());
const activateSubscription = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("billing", () => ({ assignPlanToSubscriber, activateSubscription }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createResellerCustomerAction, updateResellerCustomerAction } = await import("./customer-actions");
function form(values: Record<string, string>): FormData { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }

describe("reseller customer onboarding", () => {
  const subscriberCreate = vi.fn();
  const subscriberFindFirst = vi.fn();
  const subscriberUpdate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue({ organizationId: "org-a", userId: "reseller-a" });
    createTenantClient.mockReturnValue({ resellerProfile: { findUnique: vi.fn().mockResolvedValue({ id: "profile-a" }) }, subscriber: { create: subscriberCreate, findFirst: subscriberFindFirst, update: subscriberUpdate } });
    subscriberCreate.mockResolvedValue({ id: "sub-a" });
    assignPlanToSubscriber.mockResolvedValue({ id: "subscription-a" });
  });

  it("creates an owned subscriber and activates an optional tenant plan", async () => {
    await expect(createResellerCustomerAction(null, form({ username: "alice", fullName: "Alice", email: "alice@test", phone: "+1", password: "password123", planId: "plan-a" }))).resolves.toEqual({ success: true });
    expect(subscriberCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ organization_id: "org-a", reseller_id: "profile-a", username: "alice", password_hash: expect.stringMatching(/^\$2/) }), select: { id: true } });
    expect(assignPlanToSubscriber).toHaveBeenCalledWith(expect.anything(), { subscriberId: "sub-a", planId: "plan-a" });
    expect(activateSubscription).toHaveBeenCalledWith(expect.anything(), "subscription-a");
  });

  it("updates only a customer assigned to the authenticated reseller", async () => {
    subscriberFindFirst.mockResolvedValue({ id: "sub-a" });
    await expect(updateResellerCustomerAction(null, form({ subscriberId: "sub-a", username: "alice", fullName: "Alice Updated", email: "alice2@test", phone: "+2" }))).resolves.toEqual({ success: true });
    expect(subscriberFindFirst).toHaveBeenCalledWith({ where: { id: "sub-a", reseller_id: "profile-a" }, select: { id: true } });
    expect(subscriberUpdate).toHaveBeenCalledWith({ where: { id: "sub-a" }, data: expect.objectContaining({ full_name: "Alice Updated" }) });
  });

  it("rejects an unowned customer before update", async () => {
    subscriberFindFirst.mockResolvedValue(null);
    await expect(updateResellerCustomerAction(null, form({ subscriberId: "foreign", username: "alice", fullName: "Alice" }))).resolves.toEqual({ error: "Customer is not assigned to your reseller account." });
    expect(subscriberUpdate).not.toHaveBeenCalled();
  });
});
