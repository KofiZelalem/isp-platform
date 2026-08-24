import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const sendConfiguredNotification = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({ invitation: { findUnique: vi.fn(), update: vi.fn() }, networkNode: {}, $transaction: vi.fn() }));
const supabase = vi.hoisted(() => ({ auth: { signUp: vi.fn(), updateUser: vi.fn() } }));

vi.mock("database", () => ({ createTenantClient }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/api/configured-notifications", () => ({ sendConfiguredNotification }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn().mockResolvedValue(supabase), supabaseIsConfigured: vi.fn(() => true) }));

const { acceptInvitation, createInvitationForOrganization } = await import("./invitations");

function tenantClient() {
  return {
    user: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null) },
    invitation: { create: vi.fn().mockResolvedValue({ id: "invite-a" }), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  };
}

describe("tenant invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    createTenantClient.mockReturnValue(tenantClient());
    sendConfiguredNotification.mockResolvedValue({ id: "notification-a", status: "SENT" });
    supabase.auth.signUp.mockResolvedValue({ data: { user: { id: "supabase-a" } }, error: null });
    supabase.auth.updateUser.mockResolvedValue({ error: null });
  });

  it("creates a role-validated tenant invitation with an emailed token link", async () => {
    const result = await createInvitationForOrganization({ organizationId: "org-a", invitedByUserId: "admin-a", email: " Staff@Example.com ", role: "STAFF" });
    expect(result).toEqual({ id: "invite-a" });
    const create = createTenantClient.mock.results[0].value.invitation.create;
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: "org-a", invited_by_user_id: "admin-a", email: "staff@example.com", role: "STAFF", token_hash: expect.any(String) }) }));
    expect(sendConfiguredNotification).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", channel: "EMAIL", email: "staff@example.com", message: expect.stringContaining("/invite?token=") }));
  });

  it("rejects duplicate tenant users and invalid roles", async () => {
    const client = tenantClient();
    client.user.findFirst.mockResolvedValue({ id: "existing" });
    createTenantClient.mockReturnValue(client);
    await expect(createInvitationForOrganization({ organizationId: "org-a", invitedByUserId: "admin-a", email: "x@example.test", role: "STAFF" })).rejects.toThrow("already belongs");
    await expect(createInvitationForOrganization({ organizationId: "org-a", invitedByUserId: "admin-a", email: "x@example.test", role: "CUSTOMER" as never })).rejects.toThrow("Invalid invitation role");
  });

  it("accepts a valid invitation once and creates the Supabase-backed tenant user", async () => {
    prisma.invitation.findUnique.mockResolvedValue({ id: "invite-a", organization_id: "org-a", email: "staff@example.test", role: "STAFF", status: "PENDING", expires_at: new Date(Date.now() + 60_000) });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ user: { create: vi.fn().mockResolvedValue({ id: "user-a" }) }, invitation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } }));
    await expect(acceptInvitation({ token: "valid-token", fullName: "Staff User", password: "password123" })).resolves.toEqual({ organizationId: "org-a", role: "STAFF" });
    expect(supabase.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "staff@example.test", options: expect.objectContaining({ data: expect.objectContaining({ role: "STAFF", organization_id: "org-a" }) }) }));
  });

  it("rejects expired and already-consumed invitations", async () => {
    prisma.invitation.findUnique.mockResolvedValue({ id: "invite-a", status: "ACCEPTED", expires_at: new Date(Date.now() + 60_000) });
    await expect(acceptInvitation({ token: "used", fullName: "User", password: "password123" })).rejects.toThrow("no longer available");
    prisma.invitation.findUnique.mockResolvedValue({ id: "invite-a", status: "PENDING", expires_at: new Date(Date.now() - 1) });
    await expect(acceptInvitation({ token: "expired", fullName: "User", password: "password123" })).rejects.toThrow("expired");
  });
});
