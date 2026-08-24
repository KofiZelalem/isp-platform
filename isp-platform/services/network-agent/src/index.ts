import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { MikroTikNetworkProvider } from "mikrotik";

import { getWireGuardHealth, startWireGuardInterface } from "./wireguard";

type RouterCheckCommand = {
  nodeId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
};

type SubscriberOperationCommand = RouterCheckCommand & {
  operation: "isolate" | "restore";
  subscriberId: string;
  address: string;
};

type RatePolicyCommand = RouterCheckCommand & {
  operation: "apply-rate-policy";
  subscriberId: string;
  address: string;
  uploadKbps?: number | null;
  downloadKbps?: number | null;
};

type SessionOperationCommand = RouterCheckCommand & {
  operation: "disconnect" | "reconnect";
  sessionId: string;
  subscriberId: string;
  address: string;
};

export type AgentResponse = { status: number; body: Record<string, unknown> };
const HEARTBEAT_INTERVAL_MS = 30_000;
// How far a request timestamp may drift from "now" before it is rejected as stale/replayed.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
// nonce -> expiry epoch ms; a nonce cannot be reused while it is present here.
const usedNonces = new Map<string, number>();

function sharedSecret(): string {
  const secret = process.env.NETWORK_AGENT_SHARED_SECRET;
  if (!secret || secret.length < 32) throw new Error("NETWORK_AGENT_SHARED_SECRET must be at least 32 characters.");
  return secret;
}

export function signAgentRequest(timestamp: string, nonce: string, body: string, secret = sharedSecret()): string {
  return createHmac("sha256", secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");
}

function pruneExpiredNonces(now: number): void {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
}

/** Rejects missing/invalid signatures, stale timestamps, and reused nonces (replay protection). */
function verifySignedRequest(
  body: string,
  timestamp: string | undefined,
  nonce: string | undefined,
  signature: string | undefined
): { valid: true } | { valid: false; reason: string } {
  if (!timestamp || !/^\d+$/.test(timestamp)) return { valid: false, reason: "Missing or invalid request timestamp." };
  if (!nonce || nonce.length < 16 || nonce.length > 128) return { valid: false, reason: "Missing or invalid request nonce." };
  if (!signature) return { valid: false, reason: "Missing request signature." };

  const now = Date.now();
  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime) || Math.abs(now - requestTime) > REPLAY_WINDOW_MS) {
    return { valid: false, reason: "Request timestamp is outside the allowed window." };
  }

  pruneExpiredNonces(now);
  if (usedNonces.has(nonce)) return { valid: false, reason: "Request nonce has already been used." };

  const expected = Buffer.from(signAgentRequest(timestamp, nonce, body));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return { valid: false, reason: "Invalid request signature." };
  }

  usedNonces.set(nonce, now + REPLAY_WINDOW_MS);
  return { valid: true };
}

/** When configured, restricts accepted commands to an explicit allowlist of node ids this agent may operate on. */
function assertNodeAllowed(nodeId: string): void {
  const allowlist = process.env.NETWORK_AGENT_ALLOWED_NODE_IDS;
  if (!allowlist) return;
  const allowed = allowlist.split(",").map((id) => id.trim()).filter(Boolean);
  if (!allowed.includes(nodeId)) throw new Error("This agent is not authorized to operate on the requested node.");
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 32_768) reject(new Error("Request body is too large."));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, result: AgentResponse): void {
  response.statusCode = result.status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(result.body));
}

export async function reportAgentHeartbeat(): Promise<void> {
  const controlUrl = process.env.NETWORK_AGENT_CONTROL_URL;
  const agentId = process.env.NETWORK_AGENT_ID;
  const nodeId = process.env.NETWORK_AGENT_NODE_ID;
  if (!controlUrl || !agentId || !nodeId) return;

  const tunnel = await getWireGuardHealth();
  const body = JSON.stringify({ agentId, nodeId, tunnel, reportedAt: new Date().toISOString(), agentVersion: process.env.NETWORK_AGENT_VERSION ?? "0.1.0" });
  // Heartbeat carries no credentials and only reports health, so it keeps the simpler unreplayed-body signature
  // rather than the timestamp/nonce scheme used for privileged router commands below.
  const signature = createHmac("sha256", sharedSecret()).update(body).digest("hex");
  const response = await fetch(`${new URL(controlUrl).toString().replace(/\/$/, "")}/api/internal/network-agent/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-signature": signature },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Heartbeat endpoint returned ${response.status}.`);
}

function parseRouterCommand(body: string): RouterCheckCommand {
  const value = JSON.parse(body) as Partial<RouterCheckCommand>;
  const port = value.port;
  if (!value.nodeId || !value.name || !value.host || !value.username || !value.password) {
    throw new Error("Incomplete router command.");
  }
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid router port.");
  }
  return value as RouterCheckCommand;
}

function parseSubscriberOperation(body: string): SubscriberOperationCommand {
  const value = JSON.parse(body) as Partial<SubscriberOperationCommand>;
  const router = parseRouterCommand(body);
  if ((value.operation !== "isolate" && value.operation !== "restore") || !value.subscriberId || !value.address) {
    throw new Error("Incomplete subscriber operation.");
  }
  return { ...router, operation: value.operation, subscriberId: value.subscriberId, address: value.address };
}

function parseRatePolicy(body: string): RatePolicyCommand {
  const value = JSON.parse(body) as Partial<RatePolicyCommand>;
  const router = parseRouterCommand(body);
  for (const speed of [value.uploadKbps, value.downloadKbps]) {
    if (speed !== undefined && speed !== null && (!Number.isInteger(speed) || speed < 0)) {
      throw new Error("Invalid rate policy speed.");
    }
  }
  if (value.operation !== "apply-rate-policy" || !value.subscriberId || !value.address) {
    throw new Error("Incomplete rate policy operation.");
  }
  return { ...router, operation: value.operation, subscriberId: value.subscriberId, address: value.address, uploadKbps: value.uploadKbps, downloadKbps: value.downloadKbps };
}

function parseSessionOperation(body: string): SessionOperationCommand {
  const value = JSON.parse(body) as Partial<SessionOperationCommand>;
  const router = parseRouterCommand(body);
  if ((value.operation !== "disconnect" && value.operation !== "reconnect") || !value.sessionId || !value.subscriberId || !value.address) {
    throw new Error("Incomplete session operation.");
  }
  return { ...router, operation: value.operation, sessionId: value.sessionId, subscriberId: value.subscriberId, address: value.address };
}

export async function handleAgentRequest(
  method: string,
  pathname: string,
  body: string,
  signature: string | undefined,
  timestamp?: string,
  nonce?: string
): Promise<AgentResponse> {
  const verification = verifySignedRequest(body, timestamp, nonce, signature);
  if (!verification.valid) return { status: 401, body: { error: verification.reason } };
  if (method === "GET" && pathname === "/v1/heartbeat") {
    const tunnel = await getWireGuardHealth();
    return { status: 200, body: { status: "ok", tunnel, agentId: process.env.NETWORK_AGENT_ID ?? "network-agent", checkedAt: new Date().toISOString() } };
  }
  if (method === "POST" && pathname === "/v1/subscribers/operation") {
    try {
      const command = parseSubscriberOperation(body);
      assertNodeAllowed(command.nodeId);
      const provider = new MikroTikNetworkProvider();
      try {
        await provider.connect(command);
        const target = { subscriberId: command.subscriberId, address: command.address };
        if (command.operation === "isolate") {
          await provider.isolateSubscriber(target);
          await provider.disconnectSubscriber(target);
        } else {
          await provider.restoreSubscriber(target);
        }
        return { status: 200, body: { nodeId: command.nodeId, subscriberId: command.subscriberId, operation: command.operation, status: "COMPLETED", completedAt: new Date().toISOString() } };
      } finally {
        await provider.disconnect();
      }
    } catch (error) {
      return { status: 502, body: { error: error instanceof Error ? error.message : "Subscriber operation failed." } };
    }
  }
  if (method === "POST" && pathname === "/v1/subscribers/rate-policy") {
    try {
      const command = parseRatePolicy(body);
      assertNodeAllowed(command.nodeId);
      const provider = new MikroTikNetworkProvider();
      try {
        await provider.connect(command);
        await provider.applyRatePolicy({ subscriberId: command.subscriberId, address: command.address, uploadKbps: command.uploadKbps ?? undefined, downloadKbps: command.downloadKbps ?? undefined });
        return { status: 200, body: { nodeId: command.nodeId, subscriberId: command.subscriberId, status: "COMPLETED", completedAt: new Date().toISOString() } };
      } finally {
        await provider.disconnect();
      }
    } catch (error) {
      return { status: 502, body: { error: error instanceof Error ? error.message : "Rate policy failed." } };
    }
  }
  if (method === "POST" && pathname === "/v1/sessions/operation") {
    try {
      const command = parseSessionOperation(body);
      assertNodeAllowed(command.nodeId);
      const provider = new MikroTikNetworkProvider();
      try {
        await provider.connect(command);
        const target = { subscriberId: command.subscriberId, address: command.address };
        if (command.operation === "disconnect") await provider.disconnectSubscriber(target);
        else await provider.restoreSubscriber(target);
        return { status: 200, body: { nodeId: command.nodeId, sessionId: command.sessionId, operation: command.operation, status: "COMPLETED", completedAt: new Date().toISOString() } };
      } finally {
        await provider.disconnect();
      }
    } catch (error) {
      return { status: 502, body: { error: error instanceof Error ? error.message : "Session operation failed." } };
    }
  }
  if (method !== "POST" || pathname !== "/v1/routers/check") {
    return { status: 404, body: { error: "Not found." } };
  }

  try {
    const command = parseRouterCommand(body);
    assertNodeAllowed(command.nodeId);
    const provider = new MikroTikNetworkProvider();
    try {
      await provider.connect({
        host: command.host,
        port: command.port,
        username: command.username,
        password: command.password,
        name: command.name,
      });
      return { status: 200, body: { nodeId: command.nodeId, status: "CONNECTED", checkedAt: new Date().toISOString() } };
    } finally {
      await provider.disconnect();
    }
  } catch (error) {
    return { status: 502, body: { error: error instanceof Error ? error.message : "Router check failed." } };
  }
}

export async function startNetworkAgent(port = Number(process.env.NETWORK_AGENT_PORT ?? 8090)) {
  if (process.env.NETWORK_AGENT_WIREGUARD_ENABLED === "true") await startWireGuardInterface();
  const server = createServer(async (request, response) => {
    try {
      const body = request.method === "GET" ? "" : await readBody(request);
      const header = (name: string) => {
        const value = request.headers[name];
        return Array.isArray(value) ? value[0] : value;
      };
      const result = await handleAgentRequest(
        request.method ?? "GET",
        new URL(request.url ?? "/", "http://agent").pathname,
        body,
        header("x-agent-signature"),
        header("x-agent-timestamp"),
        header("x-agent-nonce")
      );
      writeJson(response, result);
    } catch (error) {
      writeJson(response, { status: 400, body: { error: error instanceof Error ? error.message : "Invalid request." } });
    }
  });
  // Binds to loopback by default; production deployments should set NETWORK_AGENT_BIND_HOST to a private
  // WireGuard/management interface address rather than exposing the agent on every interface.
  const bindHost = process.env.NETWORK_AGENT_BIND_HOST ?? "127.0.0.1";
  server.listen(port, bindHost, () => console.log(`network-agent listening on ${bindHost}:${port}`));
  return server;
}

export function startHeartbeatReporter(): void {
  if (!process.env.NETWORK_AGENT_CONTROL_URL) return;
  const report = () => { void reportAgentHeartbeat().catch((error) => console.error("network-agent heartbeat failed:", error instanceof Error ? error.message : error)); };
  report();
  const timer = setInterval(report, HEARTBEAT_INTERVAL_MS);
  timer.unref();
}
