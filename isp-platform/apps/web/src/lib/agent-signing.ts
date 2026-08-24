import "server-only";

import { createHmac, randomBytes } from "node:crypto";

/**
 * Builds replay-resistant HMAC headers for a single request to the network-agent.
 * Binding the signature to a timestamp + one-time nonce (not just the body) means a
 * captured request cannot be resent later to repeat a privileged router command.
 */
export function buildAgentRequestHeaders(body: string, secret: string): Record<string, string> {
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
  return {
    "content-type": "application/json",
    "x-agent-timestamp": timestamp,
    "x-agent-nonce": nonce,
    "x-agent-signature": signature,
  };
}
