export { RouterOsClient } from "./client";
export type { RouterOsClientOptions, RouterOsReply } from "./client";

export { MikroTikNetworkProvider } from "./network-provider";

export { decodeNodeCredential, encodeNodeCredential } from "./credentials";

export {
  addToAddressList,
  removeFromAddressList,
  disconnectHotspotUser,
  setSimpleQueueRate,
} from "./policy";
export type { AddressListEntry } from "./policy";

export {
  applySubscriptionPolicy,
  BLOCKED_ADDRESS_LIST,
  recordRouterConnectionStatus,
} from "./subscription-policy";
export type {
  SubscriptionPolicyAction,
  ApplySubscriptionPolicyResult,
  RouterConnectionState,
} from "./subscription-policy";

export {
  generateWireGuardPeerKeyPair,
  generateRouterOsWireGuardScript,
  encodeWireGuardPrivateKey,
  decodeWireGuardPrivateKey,
} from "./wireguard";
export type { WireGuardPeerKeyPair, WireGuardScriptConfig } from "./wireguard";
