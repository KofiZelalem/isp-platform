import "server-only";

import { headers } from "next/headers";
import { z, type ZodType } from "zod";

export class RequestSecurityError extends Error {}

export async function requireSameOrigin(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const configuredOrigin = process.env.APP_ORIGIN?.trim().replace(/\/$/, "");
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const expectedOrigin = configuredOrigin ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null);

  if (!origin || !expectedOrigin || origin !== expectedOrigin) {
    throw new RequestSecurityError("Request origin is not allowed.");
  }
}

export function parseFormData<T>(formData: FormData, schema: ZodType<T>):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(Object.fromEntries(formData.entries()));
  if (result.success) return result;

  return { success: false, error: result.error.issues[0]?.message ?? "Invalid request." };
}

export const requiredId = z.string().trim().min(1, "Missing id.");