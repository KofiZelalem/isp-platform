import { describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ default: { lookup } }));

const { assertSafeWebhookDestination, isPrivateOrReservedAddress, isSyntacticallySafeWebhookUrl } = await import("./ssrf-guard");

describe("ssrf-guard", () => {
  it("rejects non-HTTPS and malformed URLs", () => {
    expect(isSyntacticallySafeWebhookUrl("http://example.test/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("ftp://example.test/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("not a url")).toBe(false);
  });

  it("rejects loopback, private, link-local, and metadata literal addresses", () => {
    expect(isSyntacticallySafeWebhookUrl("https://127.0.0.1/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("https://10.0.0.5/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("https://192.168.1.10/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("https://172.16.0.1/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("https://169.254.169.254/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("https://[::1]/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("https://localhost/hook")).toBe(false);
    expect(isSyntacticallySafeWebhookUrl("https://service.internal/hook")).toBe(false);
  });

  it("accepts a public HTTPS literal address", () => {
    expect(isSyntacticallySafeWebhookUrl("https://93.184.216.34/hook")).toBe(true);
  });

  it("treats unparsable IP-like input as unsafe by default", () => {
    expect(isPrivateOrReservedAddress("not-an-ip")).toBe(true);
  });

  it("rejects a hostname whose resolved address is private (DNS rebinding guard)", async () => {
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertSafeWebhookDestination("https://rebinding.example.test/hook")).rejects.toThrow();
  });

  it("accepts a hostname that resolves only to public addresses", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeWebhookDestination("https://public.example.test/hook")).resolves.toBeUndefined();
  });
});
