import type { TenantPrismaClient } from "database";
import { isExpiringSoon, transition } from "billing";

import { verifyChapPassword } from "./chap";
import { verifyMsChapV2Response } from "./mschapv2";
import { verifyPapPassword } from "./pap";

export type RadiusAuthAccept = {
  accept: true;
  subscriberId: string;
  subscriptionId: string;
  planName: string;
  sessionTimeoutSec: number;
  replyMessage: string;
  replyAttributes: Record<string, string>;
};

export type RadiusAuthReject = {
  accept: false;
  reason: string;
};

export type RadiusAuthResult = RadiusAuthAccept | RadiusAuthReject;

/**
 * Authorization checks shared by every authentication protocol below: an
 * ACTIVE subscriber with an ACTIVE subscription that hasn't expired and
 * still has remaining data balance. Credential verification happens before
 * this is called, per RADIUS's authenticate-then-authorize flow.
 */
async function authorizeSubscriber(
  tenantDb: TenantPrismaClient,
  username: string
): Promise<RadiusAuthResult> {
  const subscriber = await tenantDb.subscriber.findFirst({
    where: { username },
    select: {
      id: true,
      status: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        orderBy: { started_at: "desc" },
        take: 1,
        select: {
          id: true,
          expires_at: true,
          data_used_mb: true,
          plan: {
            select: {
              name: true,
              data_limit_mb: true,
              time_limit_minutes: true,
              speed_upload_kbps: true,
              speed_download_kbps: true,
              radius_group: true,
              mikrotik_profile: true,
            },
          },
        },
      },
    },
  });

  if (!subscriber) return { accept: false, reason: "Unknown username." };
  if (subscriber.status !== "ACTIVE") {
    return { accept: false, reason: `Subscriber account is ${subscriber.status.toLowerCase()}.` };
  }

  const subscription = subscriber.subscriptions[0];
  if (!subscription) return { accept: false, reason: "No active subscription." };

  if (subscription.expires_at && subscription.expires_at.getTime() <= Date.now()) {
    // Reconcile the persisted state with the billing state machine instead of
    // waiting for a separate expiry job to catch up.
    await tenantDb.subscription.update({
      where: { id: subscription.id },
      data: { status: transition("ACTIVE", "EXPIRE") },
    });
    return { accept: false, reason: "Subscription has expired." };
  }

  if (
    subscription.plan.data_limit_mb !== null &&
    subscription.data_used_mb >= subscription.plan.data_limit_mb
  ) {
    return { accept: false, reason: "Data allowance exhausted." };
  }

  const plan = subscription.plan;
  const sessionTimeoutSec = plan.time_limit_minutes
    ? Math.min(
        plan.time_limit_minutes * 60,
        subscription.expires_at
          ? Math.max(60, Math.floor((subscription.expires_at.getTime() - Date.now()) / 1000))
          : plan.time_limit_minutes * 60
      )
    : subscription.expires_at
      ? Math.max(60, Math.floor((subscription.expires_at.getTime() - Date.now()) / 1000))
      : 86_400;
  const replyAttributes: Record<string, string> = {
    "Session-Timeout": String(sessionTimeoutSec),
  };
  if (plan.radius_group) replyAttributes["User-Group"] = plan.radius_group;
  if (plan.mikrotik_profile) replyAttributes["Mikrotik-Group"] = plan.mikrotik_profile;
  if (plan.speed_upload_kbps || plan.speed_download_kbps) {
    replyAttributes["Mikrotik-Rate-Limit"] = `${plan.speed_upload_kbps ?? 0}k/${plan.speed_download_kbps ?? 0}k`;
  }

  return {
    accept: true,
    subscriberId: subscriber.id,
    subscriptionId: subscription.id,
    planName: subscription.plan.name,
    sessionTimeoutSec,
    replyMessage: isExpiringSoon(subscription.expires_at)
      ? `Welcome back. Your ${subscription.plan.name} plan is expiring soon.`
      : `Welcome back. Connected on ${subscription.plan.name}.`,
    replyAttributes,
  };
}

export type PapAuthRequest = { username: string; password: string };

export async function authenticatePap(
  tenantDb: TenantPrismaClient,
  request: PapAuthRequest
): Promise<RadiusAuthResult> {
  const subscriber = await tenantDb.subscriber.findFirst({
    where: { username: request.username },
    select: { password_hash: true },
  });
  if (!subscriber || !(await verifyPapPassword(request.password, subscriber.password_hash))) {
    return { accept: false, reason: "Invalid credentials." };
  }
  return authorizeSubscriber(tenantDb, request.username);
}

export type ChapAuthRequest = {
  username: string;
  chapIdentifier: number;
  chapChallenge: Buffer;
  chapResponse: Buffer;
};

/**
 * NOTE: CHAP requires the RADIUS server to reproduce MD5(Ident + password +
 * challenge), which means it needs the subscriber's *cleartext* password.
 * This schema only stores `password_hash`, so — unlike PAP, which can use a
 * one-way bcrypt hash — CHAP here treats `password_hash` as that shared
 * secret material rather than a bcrypt digest. A production system needs a
 * separate, reversibly-stored credential (or an NT-Hash column) for
 * CHAP/MS-CHAPv2 subscribers alongside the bcrypt hash used for PAP/portal
 * logins.
 */
export async function authenticateChap(
  tenantDb: TenantPrismaClient,
  request: ChapAuthRequest
): Promise<RadiusAuthResult> {
  if (!Number.isInteger(request.chapIdentifier) || request.chapIdentifier < 0 || request.chapIdentifier > 255 || request.chapChallenge.length === 0 || request.chapResponse.length !== 16) {
    return { accept: false, reason: "Malformed CHAP request." };
  }
  const subscriber = await tenantDb.subscriber.findFirst({
    where: { username: request.username },
    select: { password_hash: true },
  });
  if (!subscriber) return { accept: false, reason: "Invalid credentials." };

  const ok = verifyChapPassword({
    chapIdentifier: request.chapIdentifier,
    chapChallenge: request.chapChallenge,
    chapResponse: request.chapResponse,
    password: subscriber.password_hash,
  });
  if (!ok) return { accept: false, reason: "Invalid credentials." };

  return authorizeSubscriber(tenantDb, request.username);
}

export type MsChapV2AuthRequest = {
  username: string;
  authenticatorChallenge: Buffer;
  peerChallenge: Buffer;
  ntResponse: Buffer;
};

/** See the CHAP note above — the same cleartext-credential limitation applies here. */
export async function authenticateMsChapV2(
  tenantDb: TenantPrismaClient,
  request: MsChapV2AuthRequest
): Promise<RadiusAuthResult> {
  if (request.authenticatorChallenge.length !== 16 || request.peerChallenge.length !== 16 || request.ntResponse.length !== 24) {
    return { accept: false, reason: "Malformed MS-CHAPv2 request." };
  }
  const subscriber = await tenantDb.subscriber.findFirst({
    where: { username: request.username },
    select: { password_hash: true },
  });
  if (!subscriber) return { accept: false, reason: "Invalid credentials." };

  const ok = verifyMsChapV2Response({
    authenticatorChallenge: request.authenticatorChallenge,
    peerChallenge: request.peerChallenge,
    username: request.username,
    password: subscriber.password_hash,
    ntResponse: request.ntResponse,
  });
  if (!ok) return { accept: false, reason: "Invalid credentials." };

  return authorizeSubscriber(tenantDb, request.username);
}
