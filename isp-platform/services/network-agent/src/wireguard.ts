import { chmod, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type WireGuardAgentConfig = {
  interfaceName: string;
  privateKey: string;
  address: string;
  serverPublicKey: string;
  endpoint: string;
  allowedIps: string;
  keepalive: number;
  configPath: string;
};

export type WireGuardHealth = "DISABLED" | "UP" | "DOWN" | "ERROR";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when WireGuard is enabled.`);
  return value;
}

function key(name: string): string {
  const value = required(name);
  if (!/^[A-Za-z0-9+/]{42}[A-Za-z0-9+/=]{2}$/.test(value) || Buffer.from(value, "base64").length !== 32) {
    throw new Error(`${name} must be a 32-byte base64 key.`);
  }
  return value;
}

function positivePort(value: string, name: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} must be a valid port.`);
  return port;
}

export function wireGuardEnabled(): boolean {
  return process.env.NETWORK_AGENT_WIREGUARD_ENABLED === "true";
}

export function readWireGuardConfig(): WireGuardAgentConfig {
  if (!wireGuardEnabled()) throw new Error("WireGuard is disabled.");
  const endpoint = required("NETWORK_AGENT_WIREGUARD_ENDPOINT");
  const endpointUrl = new URL(endpoint.includes("://") ? endpoint : `udp://${endpoint}`);
  const port = positivePort(endpointUrl.port || process.env.NETWORK_AGENT_WIREGUARD_PORT || "51820", "WireGuard endpoint port");
  endpointUrl.port = String(port);

  const interfaceName = process.env.NETWORK_AGENT_WIREGUARD_INTERFACE?.trim() || "isp-os-wg0";
  if (!/^[a-zA-Z0-9_.-]{1,15}$/.test(interfaceName)) throw new Error("WireGuard interface name is invalid.");

  return {
    interfaceName,
    privateKey: key("NETWORK_AGENT_WIREGUARD_PRIVATE_KEY"),
    address: required("NETWORK_AGENT_WIREGUARD_ADDRESS"),
    serverPublicKey: key("NETWORK_AGENT_WIREGUARD_SERVER_PUBLIC_KEY"),
    endpoint: endpointUrl.host,
    allowedIps: process.env.NETWORK_AGENT_WIREGUARD_ALLOWED_IPS?.trim() || "10.77.0.0/24",
    keepalive: positivePort(process.env.NETWORK_AGENT_WIREGUARD_KEEPALIVE || "25", "WireGuard keepalive"),
    configPath: process.env.NETWORK_AGENT_WIREGUARD_CONFIG?.trim() || `/etc/wireguard/${interfaceName}.conf`,
  };
}

/** Generates a standard wg-quick config without returning it from an HTTP handler. */
export function generateWireGuardConfig(config: WireGuardAgentConfig): string {
  return `[Interface]\nPrivateKey = ${config.privateKey}\nAddress = ${config.address}\n\n[Peer]\nPublicKey = ${config.serverPublicKey}\nEndpoint = ${config.endpoint}\nAllowedIPs = ${config.allowedIps}\nPersistentKeepalive = ${config.keepalive}\n`;
}

export async function startWireGuardInterface(): Promise<WireGuardAgentConfig> {
  const config = readWireGuardConfig();
  await writeFile(config.configPath, generateWireGuardConfig(config), { encoding: "utf8", mode: 0o600 });
  await chmod(config.configPath, 0o600);
  await execFile("wg-quick", ["up", config.configPath], { timeout: 15_000 });
  return config;
}

export async function stopWireGuardInterface(): Promise<void> {
  const config = readWireGuardConfig();
  await execFile("wg-quick", ["down", config.configPath], { timeout: 15_000 });
}

export async function getWireGuardHealth(): Promise<WireGuardHealth> {
  if (!wireGuardEnabled()) return "DISABLED";
  try {
    const config = readWireGuardConfig();
    await execFile("wg", ["show", config.interfaceName], { timeout: 5_000 });
    return "UP";
  } catch {
    return "DOWN";
  }
}
