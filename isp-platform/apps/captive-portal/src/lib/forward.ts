const ALLOWED_QUERY_KEYS = [
  "organization",
  "destination",
  "nasNode",
  "link-orig",
  "link-login-only",
  "chap-id",
  "chap-challenge",
  "mac",
  "ip",
] as const;

type AllowedQueryKey = (typeof ALLOWED_QUERY_KEYS)[number];

type SearchValue = string | string[] | undefined;

type SearchParamsShape = Record<string, SearchValue>;

function normalizeFirst(value: SearchValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

function normalizedPortalOrigin(value: string | undefined): string {
  const input = value?.trim() || "http://localhost:3000";
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "http://localhost:3000";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

export function buildPortalForwardUrl(
  searchParams: SearchParamsShape,
  portalWebOrigin = process.env.PORTAL_WEB_ORIGIN
): string {
  const base = normalizedPortalOrigin(portalWebOrigin);
  const url = new URL("/portal", base);

  for (const key of ALLOWED_QUERY_KEYS) {
    const value = normalizeFirst(searchParams[key as AllowedQueryKey]);
    if (value) url.searchParams.set(key, value);
  }

  return url.toString();
}

export { ALLOWED_QUERY_KEYS };
