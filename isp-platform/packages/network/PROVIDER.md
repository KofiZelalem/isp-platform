# NetworkProvider Interface & Implementation

## Overview

The `NetworkProvider` interface abstracts the underlying network infrastructure, allowing ISP-OS to enforce subscriber policies (rate limiting, session management, isolation) across different network types without coupling business logic to specific hardware or protocols.

## Interface Contract

```typescript
interface NetworkProvider {
  connect(node: NetworkNodeConnection): Promise<void>
  disconnect(): Promise<void>
  isolateSubscriber(target: SubscriberNetworkTarget): Promise<void>
  restoreSubscriber(target: SubscriberNetworkTarget): Promise<void>
  disconnectSubscriber(target: SubscriberNetworkTarget): Promise<void>
  applyRatePolicy(policy: NetworkRatePolicy): Promise<void>
  getStatus(): NetworkProviderStatus
}
```

### Types

**NetworkNodeConnection**
```typescript
{
  host: string              // Router IP address
  port: number              // Management port (e.g., 8728 for MikroTik)
  username: string          // Encrypted with AES-256-GCM (legacy: Base64 for backward compatibility)
  password: string          // Encrypted with AES-256-GCM (legacy: Base64 for backward compatibility)
  name: string              // Human-readable router name
}
```

**SubscriberNetworkTarget**
```typescript
{
  subscriberId: string      // UUID of subscriber
  address: string           // Subscriber IP address on the network
}
```

**NetworkRatePolicy**
```typescript
{
  subscriberId: string      // UUID of subscriber
  address: string           // Subscriber IP address
  uploadKbps?: number       // Upload speed limit in Kbps (undefined = no limit)
  downloadKbps?: number     // Download speed limit in Kbps (undefined = no limit)
}
```

**NetworkProviderStatus**
```typescript
{
  connected: boolean
  lastError?: string
}
```

## Method Semantics

### `connect(node: NetworkNodeConnection): Promise<void>`
Establishes a connection to the network node. Must be called before any policy operations. Connection credentials are decrypted from the stored encrypted values.


**Preconditions:**
- `node.username` and `node.password` are AES-256-GCM encrypted with PBKDF2-derived keys
- Backward compatibility: Legacy Base64 credentials automatically detected and decrypted
- Network connectivity to `node.host:node.port` is available
**Postconditions:**
- Provider is ready to accept policy operations
- Connection is cached internally; subsequent operations reuse it

**Errors:**
- Throws if node is unreachable or credentials invalid
- Errors are caught by the caller and reported in operation results

### `disconnect(): Promise<void>`
Closes the connection to the network node. Should always be called in a `finally` block.

### `isolateSubscriber(target: SubscriberNetworkTarget): Promise<void>`
Blocks a subscriber's traffic at the network level without terminating active sessions.

**Semantics:**
- For MikroTik: adds subscriber IP to firewall block list via address list membership
- Subscriber can still appear "online" to the NAS but traffic flows drop to zero
- Used in conjunction with `disconnectSubscriber` for soft/hard termination

**Errors:**
- May fail if firewall list doesn't exist or quota is exceeded
- Failures do NOT block subsequent policy operations

### `restoreSubscriber(target: SubscriberNetworkTarget): Promise<void>`
Unblocks a previously isolated subscriber, restoring traffic flow.

**Semantics:**
- For MikroTik: removes subscriber IP from firewall block list
- Must be paired with a prior `isolateSubscriber` call

### `disconnectSubscriber(target: SubscriberNetworkTarget): Promise<void>`
Terminates the subscriber's active session(s) at the NAS level.

**Semantics:**
- For MikroTik: disconnects hotspot user, terminating their Hotspot session
- For RADIUS: [TODO] call `Disconnect-User` via RADIUS CoA (Change-of-Authorization)
- Subscriber must reconnect to regain access

**Errors:**
- May fail if session doesn't exist (idempotent; acceptable)

### `applyRatePolicy(policy: NetworkRatePolicy): Promise<void>`
Applies upload/download speed limits to a subscriber's active session.

**Semantics:**
- For MikroTik: creates or updates a simple-queue rule mapping subscriber IP → speed limits
- Speeds of 0 are used to signal a "blocked" state (e.g., on suspend)
- Speeds are best-effort; actual throughput depends on infrastructure and competing traffic

**Special Cases:**
- If `uploadKbps` and `downloadKbps` are both undefined: remove any rate policy (unlimited)
- If either is 0: subscriber is effectively blocked (no traffic passes)
- If values are negative: raises validation error in caller before reaching provider

### `getStatus(): NetworkProviderStatus`
Returns the current connection status and any recent errors.

## Implementations

### MockNetworkProvider (packages/network/src/index.ts)

Used in unit tests. Records all operations in public arrays for assertion.

```typescript
const provider = new MockNetworkProvider()
await provider.isolateSubscriber({ subscriberId: "sub-1", address: "10.0.0.10" })
expect(provider.isolated).toEqual([{ subscriberId: "sub-1", address: "10.0.0.10" }])
```

### MikroTikNetworkProvider (packages/mikrotik/src/network-provider.ts)

Wraps the RouterOS client and translates abstract operations into concrete MikroTik API calls.

**Connection:**
- Uses `packages/mikrotik/src/client.ts` for low-level API communication
- Credentials are decrypted before passing to the client

**Policy Enforcement:**
- `isolateSubscriber`: adds IP to "blocked" address list (e.g., "ISP-OS-Blocked")
- `restoreSubscriber`: removes IP from "blocked" address list
- `disconnectSubscriber`: calls `/ip/hotspot/user/disconnect` with matching IP
- `applyRatePolicy`: creates/updates simple-queue rules via `/queue/simple/`

**Error Handling:**
- All operations catch and re-throw errors; calling code decides to retry/skip
- Connection failures are logged as `RouterConnectionStatus.ERROR`

## Future Implementations

### Planned Isolation Methods

1. **RADIUS CoA (Change-of-Authorization)** — For FreeRADIUS integrations
   - `disconnectSubscriber` sends Disconnect-User CoA packet to NAS
   - Allows graceful session termination without MikroTik coupling
   - Used in Stage 13+ for multi-vendor NAS support

2. **VLAN Isolation** — For enterprise switches
   - `isolateSubscriber` moves subscriber port to a "quarantine" VLAN with no uplink
   - Requires SNMP/NetConf integration

3. **BGP Flowspec** — For large-scale carrier networks
   - `applyRatePolicy` installs per-subscriber flowspec rules at edge routers
   - Decouples policy from per-device queues; scales to 100k+ subscribers

## Testing & Validation

### Unit Tests
- [subscription-policy.test.ts](../../mikrotik/src/subscription-policy.test.ts) uses `MockNetworkProvider`
- Tests validate policy orchestration logic independently of router hardware

### Integration Tests (TODO)
- Need end-to-end validation against real MikroTik router + FreeRADIUS
- Currently no hardware available; tests defer to Stage 15+

### Hardware Requirements for Real Validation
- MikroTik RouterOS 7.x instance with hotspot + API enabled (port 8728)
- FreeRADIUS 3.x with rlm_rest module + ISP-OS bridge route handlers
- Test subscriber with Hotspot credentials and RADIUS authentication
- Network segment to isolate test traffic

## Security Considerations


### Credential Storage
- Router credentials are AES-256-GCM encrypted at rest in database
- PBKDF2 key derivation with 100k SHA-256 iterations
- Random 128-bit IV per encryption instance
- 128-bit authentication tag detects tampering/corruption
- Backward compatibility: Legacy Base64 credentials automatically detected and readable
- Key management: ISP_OS_CREDENTIALS_ENCRYPTION_KEY env var (fallback: SHA-256 hash of Supabase URL)
- Credentials decrypted only when needed for connection (MikroTik API auth or WireGuard key ops)
### Session Isolation
- Subscriber IP-based isolation is **session-aware but not multi-session-safe**
- If subscriber has sessions on multiple routers, each must be isolated separately
- Current limitation: concurrent sessions share a single time-limit (per subscription, not per-session)

### RADIUS Integration
- RADIUS isolation via CoA packets is **not yet implemented**
- Current path: firewall block only; RADIUS sees session as active (false positive)
- Implementation needed for compliance audit purposes

## Configuration & Dependencies

### Runtime Dependencies
- `packages/network` exports interface + mock
- `packages/mikrotik` implements MikroTik adapter
- `packages/database` provides encrypted credential storage

### Environment Variables
- `ISP_OS_CREDENTIALS_ENCRYPTION_KEY` — Master key for AES-256-GCM credential encryption (optional; fallback: Supabase URL hash)

- `MIKROTIK_API_PORT` — [optional] override default 8728 if using non-standard port
- `MIKROTIK_TIMEOUT_SEC` — [optional] connection timeout (default: 10s)
### Integration Points
- Called by `packages/mikrotik/src/subscription-policy.ts` during suspend/restore/enforce actions
- Called by `apps/web/src/app/(admin)/admin/sessions/actions.ts` for admin-initiated disconnects
- Not directly used by RADIUS; firewall isolation is the enforcement mechanism

## Migration Path (Stage 13+)


1. **Current (Stage 12):** MikroTik firewall blocking only
2. **Stage 13:** Add speed enforcement on suspend + input validation + AES-256-GCM encryption ✅
3. **Stage 14:** Implement RADIUS CoA for graceful session termination
4. **Stage 15:** Add live session/usage dashboards showing isolated subscribers
5. **Stage 16+:** Support credential key rotation with versioned encryption
6. **Future:** Support additional providers (VLAN, BGP Flowspec)

---

**Last Updated:** 2026-08-21 (Stage 13 - Credential Encryption Complete)
