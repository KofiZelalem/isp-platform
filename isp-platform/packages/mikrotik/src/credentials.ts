import { decryptCredential, encryptCredential, getMasterEncryptionKey } from "./crypto";

/**
 * Decrypts router credentials stored in the database.
 *
 * Supports both:
 * - AES-256-GCM (new, encrypted format)
 * - Base64 (legacy, unencrypted; for backward compatibility)
 *
 * This allows gradual migration of existing credentials without downtime.
 *
 * @param encoded - Encrypted credential (AES or legacy Base64)
 * @returns Plaintext credential
 * @throws If decryption fails
 */
export function decodeNodeCredential(encoded: string): string {
  const masterKey = getMasterEncryptionKey();
  return decryptCredential(encoded, masterKey);
}

/**
 * Encrypts router credentials for storage in the database using AES-256-GCM.
 *
 * @param plain - Plaintext credential (password, username, API key, etc.)
 * @returns Encrypted credential (AES-256-GCM in base64url format)
 * @throws If encryption fails or plaintext is empty
 */
export function encodeNodeCredential(plain: string): string {
  const masterKey = getMasterEncryptionKey();
  return encryptCredential(plain, masterKey);
}

