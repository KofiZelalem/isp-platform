export type PaymentStatus = "success" | "failed" | "pending" | "cancelled" | "refunded"

export type PaymentMetadata = Record<string, string | number | boolean | null>

export type PaymentInitParams = {
  amountMinorUnits: number
  currency: string
  internalReference: string
  customerEmail: string
  callbackUrl: string
  metadata: PaymentMetadata
}

export type PaymentInitResult = {
  checkoutUrl: string
  providerReference: string
}

export type PaymentVerifyResult = {
  status: PaymentStatus
  amountMinorUnits: number
  currency: string
  providerReference: string
  paidAt: Date | null
}

export type PaymentWebhookEvent = {
  eventType: string
  internalReference: string
  providerReference: string
  status: PaymentStatus
}

export class PaymentProviderError extends Error {
  readonly code: string
  readonly providerResponse?: unknown

  constructor(code: string, message: string, providerResponse?: unknown) {
    super(message)
    this.name = "PaymentProviderError"
    this.code = code
    this.providerResponse = providerResponse
  }
}

export interface PaymentProvider {
  initializePayment(params: PaymentInitParams): Promise<PaymentInitResult>
  verifyTransaction(reference: string): Promise<PaymentVerifyResult>
  parseWebhookEvent(rawBody: string, signatureHeader: string): PaymentWebhookEvent
}
