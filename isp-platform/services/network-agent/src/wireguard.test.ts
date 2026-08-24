import { beforeEach, describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());
const writeFile = vi.hoisted(() => vi.fn());
const chmod = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ execFile }));
vi.mock("node:fs/promises", () => ({ writeFile, chmod }));

const {
  generateWireGuardConfig,
  getWireGuardHealth,
  readWireGuardConfig,
  startWireGuardInterface,
  stopWireGuardInterface,
} = await import("./wireguard");

function configure() {
  vi.stubEnv("NETWORK_AGENT_WIREGUARD_ENABLED", "true");
  vi.stubEnv("NETWORK_AGENT_WIREGUARD_INTERFACE", "isp-os-wg0");
  vi.stubEnv("NETWORK_AGENT_WIREGUARD_PRIVATE_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  vi.stubEnv("NETWORK_AGENT_WIREGUARD_SERVER_PUBLIC_KEY", "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=");
  vi.stubEnv("NETWORK_AGENT_WIREGUARD_ADDRESS", "10.77.0.2/32");
  vi.stubEnv("NETWORK_AGENT_WIREGUARD_ENDPOINT", "vpn.example.test:51820");
  vi.stubEnv("NETWORK_AGENT_WIREGUARD_CONFIG", "C:/wireguard/isp-os-wg0.conf");
}

describe("network-agent WireGuard lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configure();
    execFile.mockImplementation((_command: string, _args: string[], _options: unknown, callback: (error: null) => void) => callback(null));
    writeFile.mockResolvedValue(undefined);
    chmod.mockResolvedValue(undefined);
  });

  it("validates environment configuration and generates wg-quick config", () => {
    const config = readWireGuardConfig();
    const text = generateWireGuardConfig(config);
    expect(text).toContain("PrivateKey = AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    expect(text).toContain("Endpoint = vpn.example.test:51820");
    expect(text).toContain("AllowedIPs = 10.77.0.0/24");
  });

  it("writes a private config and brings the interface up and down", async () => {
    const config = await startWireGuardInterface();
    expect(config.interfaceName).toBe("isp-os-wg0");
    expect(writeFile).toHaveBeenCalledWith("C:/wireguard/isp-os-wg0.conf", expect.any(String), expect.objectContaining({ mode: 0o600 }));
    expect(chmod).toHaveBeenCalledWith("C:/wireguard/isp-os-wg0.conf", 0o600);
    expect(execFile).toHaveBeenCalledWith("wg-quick", ["up", "C:/wireguard/isp-os-wg0.conf"], expect.any(Object), expect.any(Function));

    await stopWireGuardInterface();
    expect(execFile).toHaveBeenCalledWith("wg-quick", ["down", "C:/wireguard/isp-os-wg0.conf"], expect.any(Object), expect.any(Function));
  });

  it("reports interface health and does not expose private key material", async () => {
    execFile.mockImplementation((command: string, _args: string[], _options: unknown, callback: (error: null, stdout: string) => void) => callback(null, command === "wg" ? "interface: isp-os-wg0" : ""));
    await expect(getWireGuardHealth()).resolves.toBe("UP");
    const health = await getWireGuardHealth();
    expect(health).not.toContain("AAAA");
  });

  it("returns disabled without requiring tunnel secrets", async () => {
    vi.stubEnv("NETWORK_AGENT_WIREGUARD_ENABLED", "false");
    await expect(getWireGuardHealth()).resolves.toBe("DISABLED");
  });
});
