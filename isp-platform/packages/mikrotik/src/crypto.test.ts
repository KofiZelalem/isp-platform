import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  encryptCredential,
  decryptCredential,
  getMasterEncryptionKey,
} from "./crypto";

// Mock environment for tests
beforeEach(() => {
  vi.stubEnv("ISP_OS_CREDENTIALS_ENCRYPTION_KEY", "test-key-32-chars-minimum-length");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
});

describe("credential encryption (AES-256-GCM)", () => {
  it("encrypts and decrypts a credential", () => {
    const plaintext = "super-secret-router-password";
    const key = getMasterEncryptionKey();

    const encrypted = encryptCredential(plaintext, key);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(plaintext); // Should not be plaintext

    const decrypted = decryptCredential(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same-password";
    const key = getMasterEncryptionKey();

    const encrypted1 = encryptCredential(plaintext, key);
    const encrypted2 = encryptCredential(plaintext, key);

    expect(encrypted1).not.toBe(encrypted2); // Different IVs produce different ciphertexts
    expect(decryptCredential(encrypted1, key)).toBe(plaintext);
    expect(decryptCredential(encrypted2, key)).toBe(plaintext);
  });

  it("detects tampering (wrong master key)", () => {
    const plaintext = "secret";
    const key1 = "key-32-chars-minimum-length-----";
    const key2 = "different-32-chars-minimum-length";

    const encrypted = encryptCredential(plaintext, key1);

    expect(() => {
      decryptCredential(encrypted, key2);
    }).toThrow(/authentication tag mismatch|tampering/i);
  });

  it("rejects empty plaintext", () => {
    const key = getMasterEncryptionKey();

    expect(() => {
      encryptCredential("", key);
    }).toThrow(/must not be empty/);
  });

  it("supports backward compatibility with Base64 legacy format", () => {
    // Simulate old Base64-encoded credential
    const plaintext = "legacy-password";
    const base64Encoded = Buffer.from(plaintext, "utf8").toString("base64");

    const key = getMasterEncryptionKey();

    // New decryptCredential should handle Base64 as fallback
    const decrypted = decryptCredential(base64Encoded, key);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts various credential types", () => {
    const key = getMasterEncryptionKey();
    const credentials = [
      "user@example.com",
      "p@ssw0rd!#$%",
      "api_key_abc123_xyz789",
      "192.168.1.1:8728",
      "multi\nline\npassword",
    ];

    for (const cred of credentials) {
      const encrypted = encryptCredential(cred, key);
      const decrypted = decryptCredential(encrypted, key);
      expect(decrypted).toBe(cred);
    }
  });

  it("uses environment variable when available", () => {
    const customKey = "custom-encryption-key-with-32-chars";
    vi.stubEnv("ISP_OS_CREDENTIALS_ENCRYPTION_KEY", customKey);

    expect(getMasterEncryptionKey()).toBe(customKey);
  });

  it("falls back to Supabase URL when env var not set", () => {
    vi.stubEnv("ISP_OS_CREDENTIALS_ENCRYPTION_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    const key = getMasterEncryptionKey();
    expect(key).toBeTruthy();
    expect(key.length).toBe(64); // SHA256 hex is 64 chars
  });

  it("throws when no encryption key available", () => {
    vi.stubEnv("ISP_OS_CREDENTIALS_ENCRYPTION_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);

    expect(() => {
      getMasterEncryptionKey();
    }).toThrow(/encryption key configured/i);
  });

  it("warns when encryption key is too short", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("ISP_OS_CREDENTIALS_ENCRYPTION_KEY", "short");

    getMasterEncryptionKey();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("too short")
    );

    warnSpy.mockRestore();
  });
});
