import { NextRequest, NextResponse } from "next/server";

import { createTenantClient } from "database";
import { PaystackProvider, settlePaystackPayment } from "payments";

import { prisma } from "@/lib/db";
import { sendConfiguredNotification } from "@/lib/api/configured-notifications";
import { createPortalAuthState } from "@/lib/portal-security";

export const dynamic = "force-dynamic";

function paymentReference(request: NextRequest): string | null {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  return reference && /^payment_[0-9a-f-]{36}$/i.test(reference) ? reference : null;
}

function paymentErrorRedirect(request: NextRequest, slug?: string): NextResponse {
  const url = new URL("/portal", request.url);
  if (slug) url.searchParams.set("organization", slug);
  url.searchParams.set("payment", "verification-failed");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const reference = paymentReference(request);
  if (!secretKey || secretKey.startsWith("sk_test_placeholder") || !reference) return paymentErrorRedirect(request);

  const payment = await prisma.payment.findUnique({
    where: { internal_reference: reference },
    select: {
      organization_id: true,
      subscriber_id: true,
      subscription_id: true,
      provider: true,
      provider_response: true,
      organization: { select: { slug: true, status: true } },
    },
  });
  if (!payment || payment.provider !== "PAYSTACK" || !payment.subscriber_id || !payment.subscription_id || payment.organization.status !== "ACTIVE") {
    return paymentErrorRedirect(request, payment?.organization.slug);
  }

  const tenantDb = createTenantClient(prisma, payment.organization_id);
  try {
    const provider = new PaystackProvider(secretKey);
    const verified = await provider.verifyTransaction(reference);
    const settlement = await settlePaystackPayment(tenantDb, {
      internalReference: reference,
      providerReference: verified.providerReference,
      amountSmallestUnit: verified.amountMinorUnits,
      currency: verified.currency,
      paidAt: verified.paidAt ?? new Date(),
      providerResponse: verified as unknown as Record<string, unknown>,
    });

    const receiptPhone = payment.provider_response && typeof payment.provider_response === "object"
      ? (payment.provider_response as Record<string, unknown>).receipt_phone
      : null;
    if (!settlement.alreadySettled && typeof receiptPhone === "string") {
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

    const response = NextResponse.redirect(new URL(`/portal?organization=${encodeURIComponent(payment.organization.slug)}`, request.url));
    response.cookies.set("isp_portal_auth", createPortalAuthState({
      organizationId: payment.organization_id,
      subscriberId: payment.subscriber_id,
      subscriptionId: payment.subscription_id,
      destination: "/portal/connected",
    }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/portal",
      maxAge: 60 * 60,
    });
    return response;
  } catch {
    return paymentErrorRedirect(request, payment.organization.slug);
  }
}