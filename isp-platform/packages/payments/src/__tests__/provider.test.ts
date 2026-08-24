import { createHmac } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import { MockPaymentProvider } from "../mock-provider"
import { PaystackProvider } from "../paystack"
import { PaymentProviderError, type PaymentProvider, type PaymentWebhookEvent } from "../provider"

const secretKey = "sk_test_contract"
const webhookBody = JSON.stringify({
  event: "charge.success",
  data: {
    reference: "paystack-provider-ref",
    status: "success",
    metadata: { internal_reference: "payment-internal-ref" },
  },
})
const validSignature = createHmac("sha512", secretKey).update(webhookBody).digest("hex")
const mockWebhookBody = JSON.stringify({
  eventType: "charge.success",
  internalReference: "payment-internal-ref",
  providerReference: "mock-provider-ref",
  status: "success",
})
const mockSignature = createHmac("sha512", "mock-webhook-secret").update(mockWebhookBody).digest("hex")

function paystackFetch() {
  return vi.fn(async (url: string) => {
    if (url.includes("/verify/")) {
      return {
        ok: true,
        statusText: "OK",
        json: async () => ({
          status: true,
          data: {
            status: "success",
            reference: "paystack-provider-ref",
            amount: 4000,
            currency: "GHS",
            paid_at: "2026-01-01T00:00:00.000Z",
          },
        }),
      }
    }
    return {
      ok: true,
      statusText: "OK",
      json: async () => ({
        status: true,
        data: {
          authorization_url: "https://paystack.test/checkout",
          access_code: "access-code",
          reference: "paystack-provider-ref",
        },
      }),
    }
  })
}

function providerCases(): Array<{ name: string; create: () => PaymentProvider; signature: string; body: string }> {
  return [
    {
      name: "PaystackProvider",
      create: () => new PaystackProvider(secretKey),
      signature: validSignature,
      body: webhookBody,
    },
    {
      name: "MockPaymentProvider",
      create: () => new MockPaymentProvider(),
      signature: mockSignature,
      body: mockWebhookBody,
    },
  ]
}

for (const providerCase of providerCases()) {
  describe(providerCase.name, () => {
    it("initializePayment returns a checkout URL and provider reference", async () => {
      if (providerCase.name === "PaystackProvider") vi.stubGlobal("fetch", paystackFetch())
      const provider = providerCase.create()
      const result = await provider.initializePayment({
        amountMinorUnits: 4000,
        currency: "GHS",
        internalReference: "payment-internal-ref",
        customerEmail: "customer@example.com",
        callbackUrl: "https://isp.test/payment/callback",
        metadata: { internal_reference: "payment-internal-ref" },
      })
      expect(result.checkoutUrl).toContain("checkout")
      expect(result.providerReference).toBeTruthy()
    })

    it("initializePayment throws PaymentProviderError on provider failure", async () => {
      if (providerCase.name === "PaystackProvider") {
        vi.stubGlobal("fetch", vi.fn(async () => ({
          ok: false,
          statusText: "Bad Gateway",
          json: async () => ({ status: false, message: "provider unavailable" }),
        })))
      }
      const provider = providerCase.name === "MockPaymentProvider"
        ? new MockPaymentProvider({ failInitialize: true })
        : providerCase.create()
      await expect(provider.initializePayment({
        amountMinorUnits: 4000,
        currency: "GHS",
        internalReference: "payment-internal-ref",
        customerEmail: "customer@example.com",
        callbackUrl: "https://isp.test/payment/callback",
        metadata: {},
      })).rejects.toBeInstanceOf(PaymentProviderError)
    })

    it("verifyTransaction returns verified details", async () => {
      if (providerCase.name === "PaystackProvider") vi.stubGlobal("fetch", paystackFetch())
      const result = await providerCase.create().verifyTransaction("paystack-provider-ref")
      expect(result.status).toBe("success")
      expect(result.amountMinorUnits).toBe(4000)
      expect(result.currency).toBe("GHS")
      expect(result.providerReference).toBeTruthy()
      expect(result.paidAt).toBeInstanceOf(Date)
    })

    it("verifyTransaction throws PaymentProviderError on unknown or failed reference", async () => {
      if (providerCase.name === "PaystackProvider") {
        vi.stubGlobal("fetch", vi.fn(async () => ({
          ok: false,
          statusText: "Not Found",
          json: async () => ({ status: false, message: "unknown reference" }),
        })))
      }
      const provider = providerCase.name === "MockPaymentProvider"
        ? new MockPaymentProvider({ failVerify: true })
        : providerCase.create()
      await expect(provider.verifyTransaction("unknown-reference")).rejects.toBeInstanceOf(PaymentProviderError)
    })

    it("parseWebhookEvent returns a parsed event for a valid signature", () => {
      const event: PaymentWebhookEvent = providerCase.create().parseWebhookEvent(providerCase.body, providerCase.signature)
      expect(event.eventType).toBe("charge.success")
      expect(event.internalReference).toBe("payment-internal-ref")
      expect(event.status).toBe("success")
    })

    it("parseWebhookEvent throws PaymentProviderError for an invalid signature", () => {
      expect(() => providerCase.create().parseWebhookEvent(providerCase.body, "invalid-signature"))
        .toThrow(PaymentProviderError)
    })

    it("parseWebhookEvent throws PaymentProviderError for a tampered payload", () => {
      const tamperedBody = `${providerCase.body.slice(0, -1)} `
      expect(() => providerCase.create().parseWebhookEvent(tamperedBody, providerCase.signature))
        .toThrow(PaymentProviderError)
    })
  })
}
