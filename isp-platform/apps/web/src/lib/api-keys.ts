import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";

export type OrganizationApiKeyAuthResult =
  | {
      ok: true;
      organizationId: string;
      organizationSlug: string;
      scopes: string[];
    }
  | {
      ok: false;
      status: 401 | 403;
      reason: string;
    };

function normalizeApiKey(value: string | null): string | null {
  const apiKey = value?.trim();
  return apiKey ? apiKey : null;
}

function readApiKeyFromHeaders(headers: Headers): string | null {
  const directHeader = normalizeApiKey(headers.get("x-api-key") ?? headers.get("apikey"));
  if (directHeader) return directHeader;

  const authorization = headers.get("authorization");
  if (!authorization) return null;

  const [scheme, credentials] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer") return null;

  return normalizeApiKey(credentials ?? null);
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function scopeMatches(grantedScope: string, requiredScope: string): boolean {
  if (grantedScope === "*") return true;
  if (grantedScope === requiredScope) return true;
  if (!grantedScope.endsWith(":*")) return false;

  const prefix = grantedScope.slice(0, -1);
  return requiredScope.startsWith(prefix);
}

function hasRequiredScope(scopes: string[], requiredScope: string): boolean {
  return scopes.some((scope) => scopeMatches(scope, requiredScope));
}

export async function authorizeOrganizationApiKey(
  request: { headers: Headers },
  organizationSlug: string,
  requiredScope: string
): Promise<OrganizationApiKeyAuthResult> {
  const apiKey = readApiKeyFromHeaders(request.headers);
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      reason: "An organization API key is required.",
    };
  }

  const now = new Date();
  const apiKeyRecord = await prisma.apiKey.findFirst({
    where: {
      key_hash: hashApiKey(apiKey),
      is_active: true,
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      organization: {
        slug: organizationSlug,
        status: "ACTIVE",
        deleted_at: null,
      },
    },
    select: {
      id: true,
      organization_id: true,
      scopes: true,
      organization: { select: { slug: true } },
    },
  });

  if (!apiKeyRecord) {
    return {
      ok: false,
      status: 403,
      reason: "The supplied API key is not authorized for this organization.",
    };
  }

  if (!hasRequiredScope(apiKeyRecord.scopes, requiredScope)) {
    return {
      ok: false,
      status: 403,
      reason: `The supplied API key does not grant ${requiredScope}.`,
    };
  }

  void prisma.apiKey
    .update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: now },
    })
    .catch(() => null);

  return {
    ok: true,
    organizationId: apiKeyRecord.organization_id,
    organizationSlug: apiKeyRecord.organization.slug,
    scopes: apiKeyRecord.scopes,
  };
}