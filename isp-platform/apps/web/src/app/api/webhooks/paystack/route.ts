import { NextRequest, NextResponse } from "next/server";

import { createTenantClient } from "database";
import { processResellerCommission } from "billing";
import { sendNotification } from "notifications";
import { failPaystackPayment, PaystackProvider, settlePaystackPayment } from "payments";
import type { PaymentWebhookEvent } from "payments";

import { prisma } from "@/lib/db";
import { sendConfiguredNotification } from "@/lib/api/configured-notifications";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || secretKey.startsWith("sk_test_placeholder")) {
    console.error("[paystack-webhook] PAYSTACK_SECRET_KEY is not configured.");
    return NextResponse.json({ received: false }, { status: 500 });
  }

  const provider = new PaystackProvider(secretKey);
  let event: PaymentWebhookEvent;
  try {
    event = provider.parseWebhookEvent(rawBody, signature);
  } catch (error) {
    const status = error instanceof Error && "code" in error && error.code === "INVALID_SIGNATURE" ? 401 : 400;
    return NextResponse.json({ received: false }, { status });
  }

  if (event.eventType === "charge.success") {
    const reference = event.internalReference;

    const payment = await prisma.payment.findUnique({
      where: { internal_reference: reference },
      select: {
        id: true,
        organization_id: true,
        subscriber_id: true,
        reseller_id: true,
        provider: true,
        provider_response: true,
      },
    });

    if (!payment || payment.provider !== "PAYSTACK" || !payment.subscriber_id) {
      return NextResponse.json({ received: true });
    }

    const tenantDb = createTenantClient(prisma, payment.organization_id);

    try {
      const verified = await provider.verifyTransaction(event.providerReference);

      const settlement = await settlePaystackPayment(tenantDb, {
        internalReference: reference,
        providerReference: verified.providerReference,
        amountSmallestUnit: verified.amountMinorUnits,
        currency: verified.currency,
        paidAt: verified.paidAt ?? new Date(),
        providerResponse: verified as unknown as Record<string, unknown>,
      });

      if (settlement.alreadySettled) return NextResponse.json({ received: true });

      if (payment.reseller_id) {
        await processResellerCommission(tenantDb, {
          resellerProfileId: payment.reseller_id,
          amount: verified.amountMinorUnits / 100,
        });
      }

      await sendNotification(tenantDb, {
        organizationId: payment.organization_id,
        subscriberId: payment.subscriber_id,
        type: "PAYMENT_SUCCESS",
        channel: "IN_APP",
        subject: "Payment successful",
        message: "Payment Successful & Package Activated. Your internet access is now active.",
      });
      const receiptPhone = payment.provider_response && typeof payment.provider_response === "object"
        ? (payment.provider_response as Record<string, unknown>).receipt_phone
        : null;
      if (typeof receiptPhone === "string") {
        await sendConfiguredNotification({
          organizationId: payment.organization_id,
          subscriberId: payment.subscriber_id,
          type: "PAYMENT_SUCCESS",
          channel: "SMS",
          phone: receiptPhone,
          subject: "Payment successful",
          message: "Payment received. Your ISP-OS package is active. You can now connect to the internet.",
        });
      }
    } catch (err) {
      console.error("[paystack-webhook] Failed to activate subscription:", err);
    }
  }

  if (event.eventType === "charge.failed") {
    const reference = event.internalReference;
    const payment = await prisma.payment.findUnique({
      where: { internal_reference: reference },
      select: { organization_id: true, provider: true },
    });
    if (!payment || payment.provider !== "PAYSTACK") return NextResponse.json({ received: true });
    const tenantDb = createTenantClient(prisma, payment.organization_id);
    await failPaystackPayment(tenantDb, {
      internalReference: reference,
      reason: "Paystack payment failed.",
      providerResponse: event,
    });
  }

  return NextResponse.json({ received: true });
}
