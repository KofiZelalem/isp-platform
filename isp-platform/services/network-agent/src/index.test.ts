import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.hoisted(() => vi.fn());
const disconnect = vi.hoisted(() => vi.fn());
const applyRatePolicy = vi.hoisted(() => vi.fn());
const disconnectSubscriber = vi.hoisted(() => vi.fn());
const restoreSubscriber = vi.hoisted(() => vi.fn());

vi.mock("mikrotik", () => ({
  MikroTikNetworkProvider: class {
    connect = connect;
    disconnect = disconnect;
    applyRatePolicy = applyRatePolicy;
    disconnectSubscriber = disconnectSubscriber;
    restoreSubscriber = restoreSubscriber;
  },
}));

const { handleAgentRequest, reportAgentHeartbeat, signAgentRequest } = await import("./index");

const secret = "12345678901234567890123456789012";
const payload = JSON.stringify({
  nodeId: "node-a",
  name: "Core Router",
  host: "10.0.0.1",
  port: 8728,
  username: "encrypted-user",
  password: "encrypted-password",
});

let nonceCounter = 0;
function sign(body: string, at = Date.now()) {
  const timestamp = String(at);
  const nonce = `${(nonceCounter++).toString(16).padStart(32, "0")}`;
  return { timestamp, nonce, signature: signAgentRequest(timestamp, nonce, body, secret) };
}

describe("network agent control protocol", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NETWORK_AGENT_SHARED_SECRET", secret);
    vi.clearAllMocks();
    connect.mockResolvedValue(undefined);
    disconnect.mockResolvedValue(undefined);
  });

  it("accepts a valid signed router command and never includes credentials in response", async () => {
    const { timestamp, nonce, signature } = sign(payload);
    const result = await handleAgentRequest("POST", "/v1/routers/check", payload, signature, timestamp, nonce);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ nodeId: "node-a", status: "CONNECTED" });
    expect(result.body).not.toHaveProperty("username");
    expect(result.body).not.toHaveProperty("password");
    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("rejects missing or invalid signatures before executing hardware operations", async () => {
    const { timestamp, nonce } = sign(payload);
    await expect(handleAgentRequest("POST", "/v1/routers/check", payload, undefined, timestamp, nonce)).resolves.toMatchObject({ status: 401 });
    await expect(handleAgentRequest("POST", "/v1/routers/check", payload, "bad", timestamp, nonce)).resolves.toMatchObject({ status: 401 });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a request whose timestamp is outside the replay window", async () => {
    const { timestamp, nonce, signature } = sign(payload, Date.now() - 10 * 60 * 1000);
    await expect(handleAgentRequest("POST", "/v1/routers/check", payload, signature, timestamp, nonce)).resolves.toMatchObject({ status: 401 });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a replayed nonce even with a valid signature", async () => {
    const { timestamp, nonce, signature } = sign(payload);
    await expect(handleAgentRequest("POST", "/v1/routers/check", payload, signature, timestamp, nonce)).resolves.toMatchObject({ status: 200 });
    await expect(handleAgentRequest("POST", "/v1/routers/check", payload, signature, timestamp, nonce)).resolves.toMatchObject({ status: 401 });
  });

  it("rejects a command for a node outside the configured allowlist", async () => {
    vi.stubEnv("NETWORK_AGENT_ALLOWED_NODE_IDS", "node-other,node-b");
    const { timestamp, nonce, signature } = sign(payload);
    const result = await handleAgentRequest("POST", "/v1/routers/check", payload, signature, timestamp, nonce);
    expect(result.status).toBe(502);
    expect(connect).not.toHaveBeenCalled();
  });

  it("returns heartbeat only for signed requests", async () => {
    const { timestamp, nonce, signature } = sign("");
    const result = await handleAgentRequest("GET", "/v1/heartbeat", "", signature, timestamp, nonce);
    expect(result).toMatchObject({ status: 200, body: { status: "ok" } });
  });

  it("reports configured identity and tunnel state through the signed control channel", async () => {
    vi.stubEnv("NETWORK_AGENT_CONTROL_URL", "https://control.example.test");
    vi.stubEnv("NETWORK_AGENT_ID", "agent-a");
    vi.stubEnv("NETWORK_AGENT_NODE_ID", "node-a");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await reportAgentHeartbeat();

    expect(fetchMock).toHaveBeenCalledWith("https://control.example.test/api/internal/network-agent/heartbeat", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-agent-signature": expect.any(String) }),
    }));
    const reported = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(reported).toMatchObject({ agentId: "agent-a", nodeId: "node-a", tunnel: "DISABLED" });
    expect(reported).not.toHaveProperty("privateKey");
  });

  it("applies a validated rate policy through the provider", async () => {
    const ratePayload = JSON.stringify({
      operation: "apply-rate-policy",
      subscriberId: "sub-a",
      address: "10.0.0.20",
      uploadKbps: 512,
      downloadKbps: 2048,
      nodeId: "node-a",
      name: "Core Router",
      host: "10.0.0.1",
      port: 8728,
      username: "encrypted-user",
      password: "encrypted-password",
    });
    const { timestamp, nonce, signature } = sign(ratePayload);

    await expect(handleAgentRequest("POST", "/v1/subscribers/rate-policy", ratePayload, signature, timestamp, nonce)).resolves.toMatchObject({
      status: 200,
      body: { nodeId: "node-a", subscriberId: "sub-a", status: "COMPLETED" },
    });
    expect(applyRatePolicy).toHaveBeenCalledWith({ subscriberId: "sub-a", address: "10.0.0.20", uploadKbps: 512, downloadKbps: 2048 });
  });

  it("dispatches session disconnect and reconnect through provider primitives", async () => {
    const sessionPayload = JSON.stringify({ ...JSON.parse(payload), operation: "disconnect", sessionId: "session-a", subscriberId: "sub-a", address: "10.0.0.20" });
    const disconnectSignature = sign(sessionPayload);
    await expect(handleAgentRequest("POST", "/v1/sessions/operation", sessionPayload, disconnectSignature.signature, disconnectSignature.timestamp, disconnectSignature.nonce)).resolves.toMatchObject({ status: 200, body: { operation: "disconnect" } });
    expect(disconnectSubscriber).toHaveBeenCalledWith({ subscriberId: "sub-a", address: "10.0.0.20" });

    const reconnectPayload = sessionPayload.replace('"disconnect"', '"reconnect"');
    const reconnectSignature = sign(reconnectPayload);
    await expect(handleAgentRequest("POST", "/v1/sessions/operation", reconnectPayload, reconnectSignature.signature, reconnectSignature.timestamp, reconnectSignature.nonce)).resolves.toMatchObject({ status: 200, body: { operation: "reconnect" } });
    expect(restoreSubscriber).toHaveBeenCalledWith({ subscriberId: "sub-a", address: "10.0.0.20" });
  });
});

