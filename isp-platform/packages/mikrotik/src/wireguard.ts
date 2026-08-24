import { generateKeyPairSync } from "node:crypto";

import { decodeNodeCredential, encodeNodeCredential } from "./credentials";

export type WireGuardPeerKeyPair = {
  privateKey: string;
  publicKey: string;
};

export type WireGuardScriptConfig = {
  routerName: string;
  routerPrivateKey: string;
  routerVpnIp: string;
  serverPublicKey: string;
  serverEndpoint: string;
  serverPort: number;
  serverNetwork: string;
};

/** Generates standard 32-byte base64 WireGuard keys using the OS X25519 implementation. */
export function generateWireGuardPeerKeyPair(): WireGuardPeerKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const privateDer = privateKey.export({ type: "pkcs8", format: "der" });
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey: privateDer.subarray(-32).toString("base64"),
    publicKey: publicDer.subarray(-32).toString("base64"),
  };
}

/**
 * Generates a paste-ready RouterOS v7 script. It is deliberately idempotent:
 * an existing platform interface/peer is removed before the new configuration.
 */
export function generateRouterOsWireGuardScript(config: WireGuardScriptConfig): string {
  const safeName = config.routerName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  const interfaceName = `wg-platform-${safeName}`;

  return `# ISP-OS WireGuard setup for ${config.routerName}
# Generated ${new Date().toISOString()}
# Paste into a RouterOS v7 terminal as an administrator.

:local wgName "${interfaceName}"
/interface/wireguard/remove [find name=$wgName]
/interface/wireguard/add name=$wgName private-key="${config.routerPrivateKey}" listen-port=13231

/ip/address/add address=${config.routerVpnIp}/32 interface=$wgName comment="ISP-OS tunnel"

/interface/wireguard/peers/add interface=$wgName public-key="${config.serverPublicKey}" endpoint-address=${config.serverEndpoint} endpoint-port=${config.serverPort} allowed-address=${config.serverNetwork} persistent-keepalive=25 comment="ISP-OS cloud"

# Route the ISP-OS WireGuard network through the tunnel.
/ip/route/add dst-address=${config.serverNetwork} gateway=$wgName comment="ISP-OS tunnel route"

:put "ISP-OS WireGuard tunnel configured for ${config.routerName}"
:put "Router VPN address: ${config.routerVpnIp}"
`;
}

export function encodeWireGuardPrivateKey(privateKey: string): string {
  return encodeNodeCredential(privateKey);
}

export function decodeWireGuardPrivateKey(encodedPrivateKey: string): string {
  return decodeNodeCredential(encodedPrivateKey);
}
