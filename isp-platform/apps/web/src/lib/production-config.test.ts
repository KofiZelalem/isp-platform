import { describe, expect, it } from "vitest";

import { validateProductionConfig } from "./production-config";

describe("production configuration", () => {
  it("accepts non-production environments without requiring deployment secrets", () => {
    expect(validateProductionConfig({ NODE_ENV: "test" })).toEqual({ valid: true });
  });

  it("reports missing production variables without exposing values", () => {
    const result = validateProductionConfig({ NODE_ENV: "production", DATABASE_URL: "configured" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missing).toContain("PORTAL_AUTH_SECRET");
      expect(result.missing).not.toContain("DATABASE_URL");
    }
  });

  it("accepts complete production configuration", () => {
    const env = Object.fromEntries([
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "ISP_OS_CREDENTIALS_ENCRYPTION_KEY",
      "PORTAL_AUTH_SECRET",
      "ISP_OS_WORKER_SECRET",
    ].map((name) => [name, "configured"]));
    expect(validateProductionConfig({ NODE_ENV: "production", ...env })).toEqual({ valid: true });
  });
});
