import "server-only";

import dns from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true; // fail closed on garbage input
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === "::1" || value === "::") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true; // unique local
  if (value.startsWith("fe80")) return true; // link-local
  if (value.startsWith("::ffff:")) return isPrivateIPv4(value.slice("::ffff:".length));
  return false;
}

/** Returns true if the literal IP address is a loopback, private, link-local, or metadata address. */
export function isPrivateOrReservedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // fail closed if it isn't a parsable IP
}

/** Cheap, synchronous rejection of obviously unsafe webhook URLs (HTTPS-only, no literal private/loopback IP). */
export function isSyntacticallySafeWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;

  const literalIpVersion = isIP(hostname);
  if (literalIpVersion && isPrivateOrReservedAddress(hostname)) return false;

  return true;
}

/**
 * Resolves the webhook hostname and rejects it if any resolved address is private/loopback/link-local.
 * Must be called immediately before every outbound webhook request (not only at creation time) to guard
 * against DNS rebinding, where a hostname's records change after initial validation.
 */
export async function assertSafeWebhookDestination(value: string): Promise<void> {
  if (!isSyntacticallySafeWebhookUrl(value)) {
    throw new Error("Webhook destination is not an allowed HTTPS public address.");
  }

  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return; // literal IP already checked above

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = records.map((record) => record.address);
  } catch {
    throw new Error("Webhook destination hostname could not be resolved.");
  }

  if (addresses.length === 0 || addresses.some((address) => isPrivateOrReservedAddress(address))) {
    throw new Error("Webhook destination resolves to a disallowed private network address.");
  }
}
