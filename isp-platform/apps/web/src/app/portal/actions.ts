"use server";

import { randomBytes } from "node:crypto";

import { createTenantClient } from "database";
import { redeemVoucher, VoucherNotRedeemableError } from "billing";
import { initializePaystackPayment } from "payments";
import { authenticatePap } from "radius";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/db";
import { resolvePublicOrganizationFromRequest } from "@/lib/organizations";
import {
  consumePortalAttempt,
  createPortalAuthState,
  safePortalDestination,
} from "@/lib/portal-security";

export type RedeemVoucherState =
  | { error: string }
  | { success: true; planName: string; expiresAt: string | null; accessUsername: string; accessPassword: string }
  | null;

export type PortalLoginState =
  | { error: string }
  | { success: true; planName: string; sessionTimeoutSec: number }
  | null;

async function getPortalOrganization(formData: FormData) {
  const slug = String(formData.get("organizationSlug") ?? "").trim();
  if (!slug) return null;

  return resolvePublicOrganizationFromRequest(slug);
}

async function setPortalAuthCookie(state: Parameters<typeof createPortalAuthState>[0]) {
  const token = createPortalAuthState(state);
  const cookieStore = await cookies();
  cookieStore.set("isp_portal_auth", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: 60 * 60,
  });
}

async function requestIp(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Authenticates a portal subscriber through the shared RADIUS PAP boundary. */
export async function portalLoginAction(
  _prevState: PortalLoginState,
  formData: FormData
): Promise<PortalLoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };
  if (!(await consumePortalAttempt(await requestIp(), username))) {
    return { error: "Too many attempts. Try again later." };
  }

  const organization = await getPortalOrganization(formData);
  if (!organization) return { error: "This hotspot is not available right now." };

  const result = await authenticatePap(createTenantClient(prisma, organization.id), {
    username,
    password,
  });
  if (!result.accept) return { error: result.reason };

  await setPortalAuthCookie({
    organizationId: organization.id,
    subscriberId: result.subscriberId,
    subscriptionId: result.subscriptionId,
    destination: safePortalDestination(String(formData.get("destination") ?? null)),
  });

  return {
    success: true,
    planName: result.planName,
    sessionTimeoutSec: result.sessionTimeoutSec,
  };
}

/** Server Action backing the captive portal's voucher redemption form. */
export async function redeemVoucherAction(
  _prevState: RedeemVoucherState,
  formData: FormData
): Promise<RedeemVoucherState> {
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) return { error: "Enter your voucher code." };
  if (!(await consumePortalAttempt(await requestIp(), `voucher:${code}`))) {
    return { error: "Too many attempts. Try again later." };
  }

  const organization = await getPortalOrganization(formData);
  if (!organization) return { error: "This hotspot is not available right now." };

  const tenantDb = createTenantClient(prisma, organization.id);
  // Stub identity: the portal doesn't collect an account, so the voucher
  // code itself keys the guest device's Subscriber record.
  const deviceUsername = `guest-${code.toLowerCase()}`;

  try {
    const result = await redeemVoucher(tenantDb, {
      organizationId: organization.id,
      code,
      subscriberUsername: deviceUsername,
      subscriberFullName: "Voucher Guest",
    });
    await setPortalAuthCookie({
      organizationId: organization.id,
      subscriberId: result.subscriberId,
      subscriptionId: result.subscriptionId,
      destination: safePortalDestination(String(formData.get("destination") ?? null)),
    });
    return {
      success: true,
      planName: result.planName,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      accessUsername: result.accessUsername,
      accessPassword: result.accessPassword,
    };
  } catch (err) {
    if (err instanceof VoucherNotRedeemableError) {
      return { error: err.message };
    }
    return { error: "Something went wrong activating your session. Please try again." };
  }
}

export type InitializePaymentState = { error: string } | null;

function normalizeGhanaPhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(compact)) return `+233${compact.slice(1)}`;
  if (/^233\d{9}$/.test(compact)) return `+${compact}`;
  if (/^\+233\d{9}$/.test(compact)) return compact;
  return null;
}

function paymentCallbackUrl(): string | null {
  const origin = process.env.APP_ORIGIN?.trim();
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return new URL("/portal/payment/complete", url).toString();
  } catch {
    return null;
  }
}

/** Server Action that creates a PENDING Payment and redirects to Paystack checkout. */
export async function initializePaymentAction(
  _prevState: InitializePaymentState,
  formData: FormData
): Promise<InitializePaymentState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const phone = normalizeGhanaPhone(String(formData.get("phone") ?? ""));
  const planId = String(formData.get("planId") ?? "").trim();

  if (!phone) return { error: "Enter a valid Ghana phone number, for example 024 123 4567." };
  if (email && !email.includes("@")) return { error: "Enter a valid email address or leave it blank." };
  if (!planId) return { error: "Select a plan to purchase." };
  if (!(await consumePortalAttempt(await requestIp(), `payment:${phone}`))) {
    return { error: "Too many attempts. Try again later." };
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || secretKey.startsWith("sk_test_placeholder")) {
    return { error: "Payment gateway is not configured on this hotspot." };
  }

  const organization = await getPortalOrganization(formData);
  if (!organization) return { error: "This portal is not available right now." };
  const callbackUrl = paymentCallbackUrl();
  if (!callbackUrl) return { error: "The portal payment return address is not configured." };

  const tenantDb = createTenantClient(prisma, organization.id);
  // Paystack requires an email address, but mobile numbers are the primary local receipt channel.
  const paystackEmail = email || `receipt-${phone.replace(/\D/g, "")}@isp-os.app`;

  // A phone number is the portal customer's stable identity. Repeat purchases
  // add another payment/subscription to this subscriber instead of creating one.
  const existingSubscriber = await tenantDb.subscriber.findFirst({
    where: { phone },
    select: { id: true },
  });
  const subscriberId = existingSubscriber?.id ?? (await tenantDb.subscriber.create({
      data: {
        organization_id: organization.id,
        username: phone,
        password_hash: randomBytes(32).toString("hex"),
        full_name: email ? email.split("@")[0] : `Portal customer ${phone.slice(-4)}`,
        email: email || null,
        phone,
        status: "ACTIVE",
      },
      select: { id: true },
    })).id;

  let authorizationUrl: string;
  try {
    const result = await initializePaystackPayment(prisma, {
      organizationId: organization.id,
      subscriberId,
      planId,
      email: paystackEmail,
      receiptPhone: phone,
      secretKey,
      callbackUrl,
    });
    authorizationUrl = result.authorizationUrl;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to initialize payment. Try again.",
    };
  }

  // redirect() throws NEXT_REDIRECT — must be called outside any try-catch.
  redirect(authorizationUrl);
}
