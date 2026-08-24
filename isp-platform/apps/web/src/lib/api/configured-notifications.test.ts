import { beforeEach, describe, expect, it, vi } from "vitest";

const createTenantClient = vi.hoisted(() => vi.fn());
const sendNotification = vi.hoisted(() => vi.fn());
const decodeNodeCredential = vi.hoisted(() => vi.fn((value: string) => `decrypted:${value}`));
const prisma = vi.hoisted(() => ({ organizationSettings: { findUnique: vi.fn() } }));

vi.mock("database", () => ({ createTenantClient }));
vi.mock("notifications", () => ({ sendNotification }));
vi.mock("mikrotik", () => ({ decodeNodeCredential }));
vi.mock("@/lib/db", () => ({ prisma }));

const { sendConfiguredNotification } = await import("./configured-notifications");

describe("configured notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTenantClient.mockReturnValue({});
    prisma.organizationSettings.findUnique.mockResolvedValue({
      notification_email_provider: "resend",
      notification_email_api_key_enc: "encrypted-email-key",
      notification_email_from: "alerts@example.test",
      notification_sms_provider: "arkesel",
      notification_sms_api_key_enc: "encrypted-sms-key",
      notification_sms_sender: "ISP-OS",
    });
    sendNotification.mockResolvedValue({ id: "n1", status: "SENT" });
  });

  it("decrypts and passes email provider config only server-side", async () => {
    await sendConfiguredNotification({ organizationId: "org-a", type: "GENERAL", channel: "EMAIL", email: "admin@example.test", message: "Alert" });
    expect(sendNotification).toHaveBeenCalledWith({}, expect.objectContaining({ emailApiKey: "decrypted:encrypted-email-key", emailFrom: "alerts@example.test" }));
    expect(sendNotification.mock.calls[0][1]).not.toHaveProperty("organizationId", undefined);
  });

  it("resolves tenant settings through the authenticated organization id", async () => {
    await sendConfiguredNotification({ organizationId: "org-a", type: "GENERAL", channel: "SMS", phone: "+15555555555", message: "Alert" });
    expect(createTenantClient).toHaveBeenCalledWith(prisma, "org-a");
    expect(sendNotification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ smsApiKey: "decrypted:encrypted-sms-key", smsSender: "ISP-OS" }));
  });
});
