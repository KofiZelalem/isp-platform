import "server-only";

export type ProductionConfigResult = { valid: true } | { valid: false; missing: string[] };

const requiredProductionSecrets = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "ISP_OS_CREDENTIALS_ENCRYPTION_KEY",
  "PORTAL_AUTH_SECRET",
  "ISP_OS_WORKER_SECRET",
];

/** Validates deployment-critical configuration without logging secret values. */
export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env): ProductionConfigResult {
  if (env.NODE_ENV !== "production") return { valid: true };
  const missing = requiredProductionSecrets.filter((name) => !env[name]?.trim());
  return missing.length ? { valid: false, missing } : { valid: true };
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const result = validateProductionConfig(env);
  if (!result.valid) throw new Error(`Missing required production configuration: ${result.missing.join(", ")}`);
}
