import { createHmac, timingSafeEqual } from "node:crypto"

import {
  PaymentProviderError,
  type PaymentInitParams,
  type PaymentInitResult,
  type PaymentProvider,
  type PaymentStatus,
  type PaymentVerifyResult,
  type PaymentWebhookEvent,
} from "./provider"

export interface InitializeTransactionParams {
  email: string
  amountSmallestUnit: number
  reference: string
  callbackUrl?: string
  metadata?: Record<string, unknown>
}

export interface InitializeTransactionResult {
  authorizationUrl: string
  accessCode: string
  reference: string
}

export interface VerifyTransactionResult {
  status: boolean
  message?: string
  data?: {
    status: string
    reference: string
    amount: number
    currency: string
    paid_at?: string
    channel?: string
  }
}

type PaystackWebhookPayload = {
  event?: string
  data?: {
    reference?: string
    status?: string
    metadata?: Record<string, unknown> | string
  }
}

function paymentStatus(status: string | undefined): PaymentStatus {
  switch (status?.toLowerCase()) {
    case "success":
    case "successful":
    case "paid":
      return "success"
    case "failed":
    case "failure":
      return "failed"
    case "cancelled":
    case "canceled":
      return "cancelled"
    case "refunded":
      return "refunded"
    default:
      return "pending"
  }
}

function parseMetadata(metadata: Record<string, unknown> | string | undefined) {
  if (!metadata) return undefined
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata) as Record<string, unknown>
    } catch {
      return undefined
    }
  }
  return metadata
}

export async function initializePaystackTransaction(
  secretKey: string,
  params: InitializeTransactionParams
): Promise<InitializeTransactionResult> {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountSmallestUnit,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  })
  const json = (await response.json().catch(() => null)) as {
    status: boolean
    message?: string
    data?: { authorization_url: string; access_code: string; reference: string }
  } | null
  if (!response.ok || !json?.status || !json.data) {
    throw new PaymentProviderError("INITIALIZE_FAILED", `Paystack initialization failed: ${json?.message ?? response.statusText}`, json)
  }
  return { authorizationUrl: json.data.authorization_url, accessCode: json.data.access_code, reference: json.data.reference }
}

export async function verifyPaystackTransaction(secretKey: string, reference: string): Promise<VerifyTransactionResult> {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const json = (await response.json().catch(() => null)) as VerifyTransactionResult | null
  if (!response.ok || !json?.status || !json.data) {
    throw new PaymentProviderError("VERIFY_FAILED", `Paystack verification failed: ${json?.message ?? response.statusText}`, json)
  }
  return json
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string, secretKey: string): boolean {
  const expectedBuffer = Buffer.from(createHmac("sha512", secretKey).update(rawBody).digest("hex"))
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length) return false
  try {
    return timingSafeEqual(expectedBuffer, signatureBuffer)
  } catch {
    return false
  }
}

export class PaystackProvider implements PaymentProvider {
  constructor(private readonly secretKey: string) {}

  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    let result: InitializeTransactionResult
    try {
      result = await initializePaystackTransaction(this.secretKey, {
        email: params.customerEmail,
        amountSmallestUnit: params.amountMinorUnits,
        reference: params.internalReference,
        callbackUrl: params.callbackUrl,
        metadata: params.metadata,
      })
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error
      throw new PaymentProviderError("INITIALIZE_FAILED", "Paystack initialization request failed.", error)
    }
    return { checkoutUrl: result.authorizationUrl, providerReference: result.reference }
  }

  async verifyTransaction(reference: string): Promise<PaymentVerifyResult> {
    let result: VerifyTransactionResult
    try {
      result = await verifyPaystackTransaction(this.secretKey, reference)
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error
      throw new PaymentProviderError("VERIFY_FAILED", "Paystack verification request failed.", error)
    }
    if (!result.data) throw new PaymentProviderError("VERIFY_FAILED", "Paystack returned no transaction data.", result)
    const status = paymentStatus(result.data.status)
    if (status !== "success") throw new PaymentProviderError("TRANSACTION_NOT_SUCCESSFUL", `Paystack transaction is ${status}.`, result)
    return {
      status,
      amountMinorUnits: result.data.amount,
      currency: result.data.currency,
      providerReference: result.data.reference,
      paidAt: result.data.paid_at ? new Date(result.data.paid_at) : null,
    }
  }

  parseWebhookEvent(rawBody: string, signatureHeader: string): PaymentWebhookEvent {
    if (!verifyPaystackWebhookSignature(rawBody, signatureHeader, this.secretKey)) {
      throw new PaymentProviderError("INVALID_SIGNATURE", "Paystack webhook signature is invalid.")
    }
    let payload: PaystackWebhookPayload
    try {
      payload = JSON.parse(rawBody) as PaystackWebhookPayload
    } catch {
      throw new PaymentProviderError("INVALID_PAYLOAD", "Paystack webhook payload is invalid.")
    }
    const providerReference = payload.data?.reference
    if (!payload.event || !providerReference) {
      throw new PaymentProviderError("INVALID_PAYLOAD", "Paystack webhook is missing event or reference.", payload)
    }
    const metadata = parseMetadata(payload.data?.metadata)
    return {
      eventType: payload.event,
      internalReference: typeof metadata?.internal_reference === "string" ? metadata.internal_reference : providerReference,
      providerReference,
      status: paymentStatus(payload.data?.status ?? (payload.event === "charge.success" ? "success" : undefined)),
    }
  }
}
