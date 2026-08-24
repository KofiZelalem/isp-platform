export type NetworkProviderStatus = "CONNECTED" | "DISCONNECTED" | "ERROR"

export type NetworkNodeConnection = {
  host: string
  port: number
  username: string
  password: string
  name: string
}

export type SubscriberNetworkTarget = {
  subscriberId: string
  address: string
}

export type NetworkRatePolicy = {
  subscriberId: string
  address: string
  uploadKbps?: number
  downloadKbps?: number
}

export interface NetworkProvider {
  connect(node: NetworkNodeConnection): Promise<void>
  disconnect(): Promise<void>
  isolateSubscriber(target: SubscriberNetworkTarget): Promise<void>
  restoreSubscriber(target: SubscriberNetworkTarget): Promise<void>
  disconnectSubscriber(target: SubscriberNetworkTarget): Promise<void>
  applyRatePolicy(policy: NetworkRatePolicy): Promise<void>
  getStatus(): NetworkProviderStatus
}

export class NetworkProviderError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "NetworkProviderError"
    this.code = code
  }
}

export class MockNetworkProvider implements NetworkProvider {
  private status: NetworkProviderStatus = "DISCONNECTED"
  readonly isolated: SubscriberNetworkTarget[] = []
  readonly restored: SubscriberNetworkTarget[] = []
  readonly disconnected: SubscriberNetworkTarget[] = []
  readonly ratePolicies: NetworkRatePolicy[] = []

  async connect(): Promise<void> {
    this.status = "CONNECTED"
  }

  async disconnect(): Promise<void> {
    this.status = "DISCONNECTED"
  }

  async isolateSubscriber(target: SubscriberNetworkTarget): Promise<void> {
    this.isolated.push(target)
  }

  async restoreSubscriber(target: SubscriberNetworkTarget): Promise<void> {
    this.restored.push(target)
  }

  async disconnectSubscriber(target: SubscriberNetworkTarget): Promise<void> {
    this.disconnected.push(target)
  }

  async applyRatePolicy(policy: NetworkRatePolicy): Promise<void> {
    this.ratePolicies.push(policy)
  }

  getStatus(): NetworkProviderStatus {
    return this.status
  }
}
