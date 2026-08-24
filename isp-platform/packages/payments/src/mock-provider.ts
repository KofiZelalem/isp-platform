// FOR TESTING ONLY - never use in production

import { createHmac, timingSafeEqual } from "node:crypto"

import {
  PaymentProviderError,
  type PaymentInitParams,
  type PaymentInitResult,
  type PaymentProvider,
  type PaymentVerifyResult,
  type PaymentWebhookEvent,
  type PaymentStatus,
} from "./provider"

export type MockPaymentProviderConfig = {
  webhookSecret?: string
  failInitialize?: boolean
  failVerify?: boolean
  failParseWebhook?: boolean
}

type MockWebhookPayload = {
  eventType?: string
  internalReference?: string
  providerReference?: string
  status?: PaymentStatus
}

export class MockPaymentProvider implements PaymentProvider {
  private readonly webhookSecret: string
  private readonly config: MockPaymentProviderConfig

  constructor(config: MockPaymentProviderConfig = {}) {
    this.config = config
    this.webhookSecret = config.webhookSecret ?? "mock-webhook-secret"
  }

  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    if (this.config.failInitialize) {
      throw new PaymentProviderError("INITIALIZE_FAILED", "Mock payment initialization failed.")
    }
    return {
      checkoutUrl: `https://mock-payments.test/checkout/${encodeURIComponent(params.internalReference)}`,
      providerReference: `mock_${params.internalReference}`,
    }
  }

  async verifyTransaction(reference: string): Promise<PaymentVerifyResult> {
    if (this.config.failVerify) {
      throw new PaymentProviderError("VERIFY_FAILED", "Mock payment verification failed.")
    }
    return {
      status: "success",
      amountMinorUnits: 4000,
      currency: "GHS",
      providerReference: reference,
      paidAt: new Date("2026-01-01T00:00:00.000Z"),
    }
  }

  parseWebhookEvent(rawBody: string, signatureHeader: string): PaymentWebhookEvent {
    if (this.config.failParseWebhook || !this.verifySignature(rawBody, signatureHeader)) {
      throw new PaymentProviderError("INVALID_SIGNATURE", "Mock webhook signature is invalid.")
    }

    let payload: MockWebhookPayload
    try {
      payload = JSON.parse(rawBody) as MockWebhookPayload
    } catch {
      throw new PaymentProviderError("INVALID_PAYLOAD", "Mock webhook payload is invalid.")
    }

    if (!payload.eventType || !payload.internalReference || !payload.providerReference || !payload.status) {
      throw new PaymentProviderError("INVALID_PAYLOAD", "Mock webhook payload is incomplete.", payload)
    }

    return {
      eventType: payload.eventType,
      internalReference: payload.internalReference,
      providerReference: payload.providerReference,
      status: payload.status,
    }
  }

  private verifySignature(rawBody: string, signatureHeader: string): boolean {
    const expected = createHmac("sha512", this.webhookSecret).update(rawBody).digest("hex")
    const expectedBuffer = Buffer.from(expected)
    const signatureBuffer = Buffer.from(signatureHeader)
    if (expectedBuffer.length !== signatureBuffer.length) return false
    return timingSafeEqual(expectedBuffer, signatureBuffer)
  }
}

export function createMockWebhookSignature(rawBody: string, secret = "mock-webhook-secret"): string {
  return createHmac("sha512", secret).update(rawBody).digest("hex")
}