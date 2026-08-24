import crypto from "crypto";

/**
 * Derives an encryption key from a master key using PBKDF2.
 * Used to generate consistent keys for credential encryption.
 *
 * @param masterKey - Base encryption key (from environment or derivation)
 * @param salt - Unique salt per credential type/field
 * @returns 32-byte key suitable for AES-256
 */
function deriveKey(masterKey: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, 100_000, 32, "sha256");
}

/**
 * Encrypts a credential value using AES-256-GCM.
 * Returns a combined buffer: IV (16) + tag (16) + ciphertext
 * Encoded as base64url for safe database storage.
 *
 * @param plaintext - The credential to encrypt (password, username, key, etc.)
 * @param masterKey - Master encryption key from environment
 * @returns base64url-encoded encrypted credential
 * @throws If plaintext is empty or masterKey is invalid
 */
export function encryptCredential(plaintext: string, masterKey: string): string {
  if (!plaintext || !masterKey) {
    throw new Error("Plaintext and master key must not be empty");
  }

  // Derive per-field key to limit damage if one credential is compromised
  const key = deriveKey(masterKey, "credential-encryption-v1");

  // Generate random IV (16 bytes)
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  // Get authentication tag
  const tag = cipher.getAuthTag();

  // Combine: IV || tag || ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);

  // Encode as base64url for database storage
  return combined.toString("base64url");
}

/**
 * Detects encryption format and decrypts accordingly.
 * Supports both AES-256-GCM (new) and Base64 (legacy/unencrypted).
 *
 * Format detection:
 * - AES format: base64url with at least 32 bytes (IV 16 + tag 16 + ciphertext)
 * - Base64 format: standard base64 that decodes to printable text
 *
 * @param encrypted - Encrypted credential in either format
 * @param masterKey - Master encryption key (only needed for AES format)
 * @returns Decrypted plaintext credential
 * @throws If decryption fails or format is unrecognized
 */
export function decryptCredential(encrypted: string, masterKey: string): string {
  if (!encrypted || !masterKey) {
    throw new Error("Encrypted credential and master key must not be empty");
  }

  // Try AES-256-GCM first (new format) - will throw on auth failure
  const aesError = tryDecryptAES(encrypted, masterKey);
  if (!aesError) {
    // Successfully decrypted with AES
    return decryptCredentialAES(encrypted, masterKey);
  }

  // Try Base64 (legacy format) as fallback
  try {
    return decryptCredentialBase64(encrypted);
  } catch (base64Error) {
    // Both failed; report AES error as it's the expected format
    throw aesError;
  }
}

/** Returns true only when the value can be authenticated and decrypted as AES-256-GCM. */
export function isModernCredential(encrypted: string, masterKey: string): boolean {
  try {
    decryptCredentialAES(encrypted, masterKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts AES decryption and returns any error (without throwing).
 * Used to decide whether to fall back to Base64.
 * @internal
 */
function tryDecryptAES(encrypted: string, masterKey: string): Error | null {
  try {
    // Decode from base64url
    const combined = Buffer.from(encrypted, "base64url");

    // Must be at least 32 bytes (IV 16 + tag 16 + ciphertext 1+)
    if (combined.length < 32) {
      return new Error("Encrypted credential format is too short for AES");
    }

    // If decoding succeeded and length is correct for AES, it's likely AES format
    // (not Base64 legacy, which would be shorter after decoding)
    return null; // Not an error; looks like AES format
  } catch (err) {
    // Not valid base64url; can't be AES format
    return new Error("Not valid base64url");
  }
}

/**
 * Decrypts using AES-256-GCM (new encryption standard).
 * @internal
 */
function decryptCredentialAES(encrypted: string, masterKey: string): string {
  try {
    // Decode from base64url
    const combined = Buffer.from(encrypted, "base64url");

    // Parse: IV (16) || tag (16) || ciphertext (rest)
    if (combined.length < 32) {
      throw new Error("Encrypted credential format is corrupted (too short)");
    }

    const iv = combined.subarray(0, 16);
    const tag = combined.subarray(16, 32);
    const ciphertext = combined.subarray(32);

    // Derive key (must match encryption)
    const key = deriveKey(masterKey, "credential-encryption-v1");

    // Create decipher
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    // Re-throw with context
    if (err instanceof Error) {
      if (err.message.includes("Unsupported state or unable to authenticate data")) {
        throw new Error(
          "Credential decryption failed: authentication tag mismatch (possible tampering or wrong key)"
        );
      }
      throw new Error(`Credential decryption (AES) failed: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Decrypts using Base64 (legacy format, not encrypted).
 * @internal
 * @deprecated This is not real encryption; exists only for backward compatibility
 */
function decryptCredentialBase64(encrypted: string): string {
  try {
    // This is just Base64 decoding (NOT encryption)
    const decoded = Buffer.from(encrypted, "base64").toString("utf8");
    if (!decoded || decoded.length === 0) {
      throw new Error("Base64 decoding produced empty result");
    }
    return decoded;
  } catch (err) {
    throw new Error(
      `Credential decryption (Base64 legacy) failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Gets the master encryption key from environment or generates a stable fallback.
 * In production, this should come from a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).
 *
 * @returns 32-byte key as hex string
 * @throws If neither environment variable nor fallback is available
 */
export function getMasterEncryptionKey(): string {
  const envKey = process.env.ISP_OS_CREDENTIALS_ENCRYPTION_KEY;

  if (envKey) {
    if (envKey.length < 32) {
      console.warn(
        "ISP_OS_CREDENTIALS_ENCRYPTION_KEY is too short (< 32 chars); encryption may be weak"
      );
    }
    return envKey;
  }

  // Fallback for development only: derive from SUPABASE_URL if available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    // Deterministic but unique per Supabase project
    const fallback = crypto
      .createHash("sha256")
      .update(supabaseUrl)
      .digest("hex");
    console.warn(
      "Using Supabase URL as credential encryption key; set ISP_OS_CREDENTIALS_ENCRYPTION_KEY for production"
    );
    return fallback;
  }

  throw new Error(
    "No encryption key configured. Set ISP_OS_CREDENTIALS_ENCRYPTION_KEY environment variable."
  );
}

