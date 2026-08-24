import { describe, expect, it } from "vitest"

import { MockNetworkProvider } from "./index"

describe("MockNetworkProvider", () => {
  it("tracks network operations behind the provider contract", async () => {
    const provider = new MockNetworkProvider()
    const node = { host: "router-a", port: 8728, username: "encoded-user", password: "encoded-pass", name: "Router A" }
    const target = { subscriberId: "subscriber-a", address: "10.0.0.10" }

    expect(provider.getStatus()).toBe("DISCONNECTED")
    await provider.connect(node)
    await provider.isolateSubscriber(target)
    await provider.disconnectSubscriber(target)
    await provider.restoreSubscriber(target)
    await provider.applyRatePolicy({ ...target, uploadKbps: 1024, downloadKbps: 2048 })
    await provider.disconnect()

    expect(provider.getStatus()).toBe("DISCONNECTED")
    expect(provider.isolated).toEqual([target])
    expect(provider.disconnected).toEqual([target])
    expect(provider.restored).toEqual([target])
    expect(provider.ratePolicies).toHaveLength(1)
  })
})
