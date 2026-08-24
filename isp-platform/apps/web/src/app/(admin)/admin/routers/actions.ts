"use server";

import { createTenantClient } from "database";
import {
  encodeWireGuardPrivateKey,
  encodeNodeCredential,
  generateRouterOsWireGuardScript,
  generateWireGuardPeerKeyPair,
} from "mikrotik";
import { revalidatePath } from "next/cache";

import { requireCurrentOrganization } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type CreateRouterState = {
  success: true;
  connectionMode: "DIRECT_LAN" | "WIREGUARD";
  routerScript?: string;
  serverPeerConfig?: string;
} | { error: string } | null;

function directLanTestEnabled(): boolean {
  return process.env.NETWORK_AGENT_DIRECT_LAN_TEST === "true";
}

function cloudWireGuardConfig() {
  const serverPublicKey = process.env.WIREGUARD_SERVER_PUBLIC_KEY;
  const serverEndpoint = process.env.WIREGUARD_SERVER_ENDPOINT;
  if (!serverPublicKey || !serverEndpoint) return null;
  if (Buffer.from(serverPublicKey, "base64").length !== 32) return null;

  return {
    serverPublicKey,
    serverEndpoint,
    serverPort: Number(process.env.WIREGUARD_SERVER_PORT ?? 51820),
    serverNetwork: process.env.WIREGUARD_SERVER_NETWORK ?? "10.77.0.0/24",
  };
}

async function allocateVpnIp(organizationId: string): Promise<string> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const nodes = await tenantDb.networkNode.findMany({
    select: { vpn_ip_address: true },
  });
  const used = new Set(nodes.map((node) => node.vpn_ip_address));

  for (let host = 2; host <= 254; host++) {
    const candidate = `10.77.0.${host}`;
    if (!used.has(candidate)) return candidate;
  }

  throw new Error("The WireGuard address pool is full.");
}

/** Registers a MikroTik node and generates its one-time WireGuard bootstrap script. */
export async function createRouterAction(
  _previousState: CreateRouterState,
  formData: FormData
): Promise<CreateRouterState> {
  const name = String(formData.get("name") ?? "").trim();
  const ipAddress = String(formData.get("ipAddress") ?? "").trim();
  const port = Number(formData.get("port") ?? 8728);
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const hotspotLoginUrl = String(formData.get("hotspotLoginUrl") ?? "").trim();

  if (!name || !ipAddress || !username || !password) {
    return { error: "Name, public IP, username, and password are required." };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "Enter a valid RouterOS API port." };
  }
  if (hotspotLoginUrl) {
    try {
      const endpoint = new URL(hotspotLoginUrl);
      if (!/^https?:$/.test(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
        return { error: "Enter an HTTP(S) hotspot login URL without credentials or fragments." };
      }
      if (endpoint.hostname.toLowerCase() !== ipAddress.toLowerCase()) {
        return { error: "The hotspot login URL must use the registered router address." };
      }
    } catch {
      return { error: "Enter a valid RouterOS hotspot login URL." };
    }
  }

  const directLanTest = directLanTestEnabled();
  const wireGuard = directLanTest ? null : cloudWireGuardConfig();
  if (!directLanTest && !wireGuard) {
    return { error: "WireGuard cloud settings are not configured on the platform." };
  }

  const { organizationId } = await requireCurrentOrganization();

  try {
    const vpnIpAddress = wireGuard ? await allocateVpnIp(organizationId) : null;
    const keyPair = wireGuard ? generateWireGuardPeerKeyPair() : null;
    const tenantDb = createTenantClient(prisma, organizationId);

    await tenantDb.networkNode.create({
      data: {
        organization_id: organizationId,
        name,
        node_type: "MIKROTIK",
        ip_address: ipAddress,
        port,
        username_enc: encodeNodeCredential(username),
        password_enc: encodeNodeCredential(password),
        hotspot_login_url: hotspotLoginUrl || undefined,
        location: location || undefined,
        status: "PROVISIONING",
        connection_status: "DISCONNECTED",
        ...(vpnIpAddress ? { vpn_ip_address: vpnIpAddress } : {}),
        ...(keyPair ? {
          wireguard_public_key: keyPair.publicKey,
          wireguard_pub_key: keyPair.publicKey,
          wireguard_private_key_enc: encodeWireGuardPrivateKey(keyPair.privateKey),
        } : {}),
      },
    });

    if (!wireGuard || !vpnIpAddress || !keyPair) {
      revalidatePath("/admin/routers");
      return { success: true, connectionMode: "DIRECT_LAN" };
    }
    const routerScript = generateRouterOsWireGuardScript({
      routerName: name,
      routerPrivateKey: keyPair.privateKey,
      routerVpnIp: vpnIpAddress,
      ...wireGuard,
    });
    const serverPeerConfig = `[Peer]\n# ${name}\nPublicKey = ${keyPair.publicKey}\nAllowedIPs = ${vpnIpAddress}/32`;

    revalidatePath("/admin/routers");
    return { success: true, connectionMode: "WIREGUARD", routerScript, serverPeerConfig };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to register router." };
  }
}
