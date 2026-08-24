import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { Redis } from "@upstash/redis";

export type PortalAuthState = {
  organizationId: string;
  subscriberId: string;
  subscriptionId: string;
  expiresAt: number;
  destination: string;
};

export type PortalNasHandoff = {
  destination: string;
  linkOrig: string | null;
  linkLoginOnly: string | null;
  chapId: string | null;
  chapChallenge: string | null;
  mac: string | null;
  ip: string | null;
};

const AUTH_STATE_TTL_SECONDS = 60 * 60;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 5;
const attempts = new Map<string, number[]>();
let redis: Redis | null | undefined;

function rateLimitRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

function cleanField(value: string | null | undefined, maxLength = 512): string | null {
  const cleaned = value?.trim();
  if (!cleaned || cleaned.length > maxLength || /[\r\n]/.test(cleaned)) return null;
  return cleaned;
}

function cleanMac(value: string | null | undefined): string | null {
  const mac = cleanField(value, 32);
  if (!mac) return null;
  return /^([0-9a-f]{2}([:-])){5}[0-9a-f]{2}$/i.test(mac) ? mac : null;
}

function cleanIp(value: string | null | undefined): string | null {
  const ip = cleanField(value, 64);
  if (!ip) return null;
  return isIP(ip) ? ip : null;
}

function cleanChapId(value: string | null | undefined): string | null {
  const chapId = cleanField(value, 3);
  if (!chapId || !/^\d{1,3}$/.test(chapId)) return null;
  const parsed = Number(chapId);
  return parsed >= 0 && parsed <= 255 ? chapId : null;
}

function cleanChapChallenge(value: string | null | undefined): string | null {
  const challenge = cleanField(value, 256);
  if (!challenge || !/^[0-9a-f]+$/i.test(challenge) || challenge.length % 2 !== 0) return null;
  return challenge;
}

function stateSecret(): string {
  const secret = process.env.PORTAL_AUTH_SECRET ?? process.env.ISP_OS_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) throw new Error("PORTAL_AUTH_SECRET must be configured for portal authentication state.");
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function createPortalAuthState(
  input: Omit<PortalAuthState, "expiresAt">,
  now = Date.now()
): string {
  const payload = encode(JSON.stringify({ ...input, expiresAt: now + AUTH_STATE_TTL_SECONDS * 1000 }));
  return `${payload}.${sign(payload)}`;
}

export function verifyPortalAuthState(token: string, now = Date.now()): PortalAuthState | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const state = JSON.parse(decode(payload)) as PortalAuthState;
    if (
      typeof state.organizationId !== "string" ||
      typeof state.subscriberId !== "string" ||
      typeof state.subscriptionId !== "string" ||
      typeof state.destination !== "string" ||
      typeof state.expiresAt !== "number" ||
      state.expiresAt <= now
    ) return null;
    return state;
  } catch {
    return null;
  }
}

export function readPortalAuthState(
  token: string | null | undefined,
  organizationId?: string,
  now = Date.now()
): PortalAuthState | null {
  if (!token) return null;

  const state = verifyPortalAuthState(token, now);
  if (!state) return null;
  if (organizationId && state.organizationId !== organizationId) return null;

  return state;
}

export function safePortalDestination(value: string | null | undefined): string {
  const destination = value?.trim();
  if (!destination || !destination.startsWith("/") || destination.startsWith("//") || destination.includes("\\")) {
    return "/portal";
  }
  try {
    const parsed = new URL(destination, "https://portal.invalid");
    if (parsed.origin !== "https://portal.invalid") return "/portal";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/portal";
  }
}

export function resolvePortalRedirectDestination(value: string | null | undefined): string {
  const destination = safePortalDestination(value);
  return destination === "/portal" ? "/portal/connected" : destination;
}

export function buildPortalNasHandoff(input: {
  destination?: string | null;
  linkOrig?: string | null;
  linkLoginOnly?: string | null;
  chapId?: string | null;
  chapChallenge?: string | null;
  mac?: string | null;
  ip?: string | null;
}): PortalNasHandoff {
  return {
    destination: safePortalDestination(input.destination),
    linkOrig: cleanField(input.linkOrig),
    linkLoginOnly: cleanField(input.linkLoginOnly),
    chapId: cleanChapId(input.chapId),
    chapChallenge: cleanChapChallenge(input.chapChallenge),
    mac: cleanMac(input.mac),
    ip: cleanIp(input.ip),
  };
}

export async function consumePortalAttempt(ip: string, identifier: string): Promise<boolean> {
  const now = Date.now();
  const keys = [`ip:${ip}`, `identifier:${identifier.toLowerCase()}`];

  const remote = rateLimitRedis();
  if (remote) {
    try {
      const results = await Promise.all(keys.map(async (key) => {
        const redisKey = `isp-os:portal-rate:${key}`;
        const count = await remote.incr(redisKey);
        if (count === 1) await remote.expire(redisKey, Math.ceil(RATE_WINDOW_MS / 1000));
        return count;
      }));
      return results.every((count) => count <= RATE_LIMIT);
    } catch {
      // Redis outages fall back to the bounded local limiter for availability.
    }
  }

  for (const key of keys) {
    const recent = (attempts.get(key) ?? []).filter((timestamp) => timestamp > now - RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) return false;
    attempts.set(key, [...recent, now]);
  }
  return true;
}

export function resetPortalAttempts(): void {
  attempts.clear();
  redis = undefined;
}