import type {
  NetworkNodeConnection,
  NetworkProvider,
  NetworkProviderStatus,
  NetworkRatePolicy,
  SubscriberNetworkTarget,
} from "network"

import { RouterOsClient } from "./client"
import { decodeNodeCredential } from "./credentials"
import { addToAddressList, disconnectHotspotUser, removeFromAddressList, setSimpleQueueRate } from "./policy"

export const BLOCKED_ADDRESS_LIST = "isp-os-blocked"

/** NetworkProvider implementation for the existing RouterOS API client. */
export class MikroTikNetworkProvider implements NetworkProvider {
  private client: RouterOsClient | null = null
  private status: NetworkProviderStatus = "DISCONNECTED"

  async connect(node: NetworkNodeConnection): Promise<void> {
    const client = new RouterOsClient({ host: node.host, port: node.port })
    try {
      await client.connect()
      await client.login(decodeNodeCredential(node.username), decodeNodeCredential(node.password))
      this.client = client
      this.status = "CONNECTED"
    } catch (error) {
      client.close()
      this.status = "ERROR"
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.client?.close()
    this.client = null
    this.status = "DISCONNECTED"
  }

  async isolateSubscriber(target: SubscriberNetworkTarget): Promise<void> {
    const client = this.requireClient()
    await addToAddressList(client, {
      list: BLOCKED_ADDRESS_LIST,
      address: target.address,
      comment: `subscriber:${target.subscriberId}`,
    })
  }

  async restoreSubscriber(target: SubscriberNetworkTarget): Promise<void> {
    const client = this.requireClient()
    await removeFromAddressList(client, {
      list: BLOCKED_ADDRESS_LIST,
      address: target.address,
    })
  }

  async disconnectSubscriber(target: SubscriberNetworkTarget): Promise<void> {
    const client = this.requireClient()
    await disconnectHotspotUser(client, target.address)
  }

  async applyRatePolicy(policy: NetworkRatePolicy): Promise<void> {
    const client = this.requireClient()
    await setSimpleQueueRate(client, {
      name: `subscriber-${policy.subscriberId}`,
      target: policy.address,
      uploadKbps: policy.uploadKbps,
      downloadKbps: policy.downloadKbps,
    })
  }

  getStatus(): NetworkProviderStatus {
    return this.status
  }

  private requireClient(): RouterOsClient {
    if (!this.client || this.status !== "CONNECTED") {
      throw new Error("MikroTik network provider is not connected.")
    }
    return this.client
  }
}
