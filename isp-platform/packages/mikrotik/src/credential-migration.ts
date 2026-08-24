import { PrismaClient } from "database";

import { decryptCredential, encryptCredential, getMasterEncryptionKey, isModernCredential } from "./crypto";

type CredentialField = "username_enc" | "password_enc" | "wireguard_private_key_enc";

const credentialFields: CredentialField[] = ["username_enc", "password_enc", "wireguard_private_key_enc"];

export type CredentialMigrationResult = {
  scanned: number;
  legacyValues: number;
  migratedValues: number;
  failedValues: number;
};

export async function migrateLegacyNodeCredentials(
  prisma: Pick<PrismaClient, "networkNode">,
  apply: boolean
): Promise<CredentialMigrationResult> {
  const masterKey = getMasterEncryptionKey();
  const nodes = await prisma.networkNode.findMany({
    select: { id: true, username_enc: true, password_enc: true, wireguard_private_key_enc: true },
  });
  const result: CredentialMigrationResult = { scanned: nodes.length, legacyValues: 0, migratedValues: 0, failedValues: 0 };

  for (const node of nodes) {
    const updates: Partial<Record<CredentialField, string>> = {};
    for (const field of credentialFields) {
      const value = node[field];
      if (!value || isModernCredential(value, masterKey)) continue;
      result.legacyValues += 1;
      try {
        const plaintext = decryptCredential(value, masterKey);
        if (apply) updates[field] = encryptCredential(plaintext, masterKey);
      } catch {
        result.failedValues += 1;
      }
    }

    if (apply && Object.keys(updates).length > 0) {
      await prisma.networkNode.update({ where: { id: node.id }, data: updates });
      result.migratedValues += Object.keys(updates).length;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (process.env.NODE_ENV === "production" && !apply) {
    throw new Error("Production credential migration is dry-run by default. Re-run with --apply after reviewing the count.");
  }
  if (!process.env.ISP_OS_CREDENTIALS_ENCRYPTION_KEY?.trim()) {
    throw new Error("ISP_OS_CREDENTIALS_ENCRYPTION_KEY is required for credential migration; fallback keys are not allowed.");
  }

  const prisma = new PrismaClient();
  try {
    const result = await migrateLegacyNodeCredentials(prisma, apply);
    console.log(JSON.stringify({ ...result, mode: apply ? "apply" : "dry-run" }));
    if (result.failedValues > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("credential-migration.ts")) void main();