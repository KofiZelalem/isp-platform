import { beforeEach, describe, expect, it, vi } from "vitest";

import { encryptCredential } from "./crypto";
import { migrateLegacyNodeCredentials } from "./credential-migration";

describe("legacy node credential migration", () => {
  beforeEach(() => {
    vi.stubEnv("ISP_OS_CREDENTIALS_ENCRYPTION_KEY", "test-key-32-chars-minimum-length");
  });

  it("reports legacy values without writing during a dry run", async () => {
    const update = vi.fn();
    const client = {
      networkNode: {
        findMany: vi.fn().mockResolvedValue([{
          id: "node-a",
          username_enc: Buffer.from("router-user").toString("base64"),
          password_enc: Buffer.from("router-password").toString("base64"),
          wireguard_private_key_enc: null,
        }]),
        update,
      },
    } as never;

    await expect(migrateLegacyNodeCredentials(client, false)).resolves.toEqual({
      scanned: 1,
      legacyValues: 2,
      migratedValues: 0,
      failedValues: 0,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("re-encrypts legacy values only when apply is explicitly enabled", async () => {
    const update = vi.fn().mockResolvedValue({});
    const client = {
      networkNode: {
        findMany: vi.fn().mockResolvedValue([{
          id: "node-a",
          username_enc: Buffer.from("router-user").toString("base64"),
          password_enc: encryptCredential("router-password", "test-key-32-chars-minimum-length"),
          wireguard_private_key_enc: null,
        }]),
        update,
      },
    } as never;

    await expect(migrateLegacyNodeCredentials(client, true)).resolves.toEqual({
      scanned: 1,
      legacyValues: 1,
      migratedValues: 1,
      failedValues: 0,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "node-a" },
      data: { username_enc: expect.any(String) },
    });
  });
});