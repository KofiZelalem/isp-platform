import type { TenantPrismaClient } from "database";

export type NotificationChannel = "EMAIL" | "SMS" | "IN_APP" | "PUSH";
export type NotificationType =
  | "PAYMENT"
  | "EXPIRY"
  | "PAYMENT_SUCCESS"
  | "PACKAGE_ACTIVATED"
  | "ROUTER_DISCONNECTED"
  | "ROUTER_ERROR"
  | "GENERAL";

export type SendNotificationInput = {
  organizationId: string;
  type: NotificationType;
  message: string;
  channel?: NotificationChannel;
  subject?: string;
  userId?: string;
  subscriberId?: string;
  recipientId?: string;
  email?: string;
  phone?: string;
  emailApiKey?: string;
  emailFrom?: string;
  smsApiKey?: string;
  smsSender?: string;
  arkeselApiKey?: string;
  arkeselSender?: string;
  retryOfId?: string;
};

export type SendNotificationResult = {
  id: string;
  status: "SENT" | "FAILED";
  providerError?: string;
};

const ARKESEL_SMS_TYPES = new Set<NotificationType>([
  "PAYMENT",
  "EXPIRY",
  "PAYMENT_SUCCESS",
  "PACKAGE_ACTIVATED",
]);

function validPhoneNumber(phone: string | null | undefined): phone is string {
  return Boolean(phone && /^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s()-]/g, "")));
}

async function sendArkeselSms(phone: string, message: string, input?: SendNotificationInput): Promise<void> {
  const apiKey = input?.arkeselApiKey ?? process.env.ARKESEL_API_KEY;
  const sender = input?.arkeselSender ?? process.env.SMS_SENDER_ID;
  if (!apiKey || !sender) {
    throw new Error("Arkesel SMS is not configured.");
  }

  const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender,
      message,
      recipients: [phone.replace(/[\s()-]/g, "")],
    }),
  });

  if (!response.ok) {
    throw new Error(`Arkesel SMS provider returned ${response.status}.`);
  }
}

async function sendEmail(input: SendNotificationInput): Promise<void> {
  const apiKey = input.emailApiKey ?? process.env.RESEND_API_KEY;
  const from = input.emailFrom ?? process.env.NOTIFICATION_EMAIL_FROM;
  if (!apiKey || !from || !input.email) {
    throw new Error("Email provider is not configured or no recipient email was supplied.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: input.subject ?? "ISP-OS notification",
      text: input.message,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}.`);
  }
}

async function sendSms(input: SendNotificationInput): Promise<void> {
  const accountSid = input.smsApiKey ?? process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = input.smsSender ?? process.env.TWILIO_FROM_NUMBER ?? process.env.SMS_SENDER_ID;
  if (!accountSid || !authToken || !from || !input.phone) {
    throw new Error("SMS provider is not configured or no recipient phone was supplied.");
  }

  const body = new URLSearchParams({ From: from, To: input.phone, Body: input.message });
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!response.ok) {
    throw new Error(`SMS provider returned ${response.status}.`);
  }
}

/** Logs a tenant notification, then routes EMAIL/SMS through configured providers. */
export async function sendNotification(
  tenantDb: TenantPrismaClient,
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  const channel = input.channel ?? "IN_APP";
  const subscriber = input.subscriberId
    ? await tenantDb.subscriber.findUnique({
        where: { id: input.subscriberId },
        select: { phone: true },
      })
    : null;
  const subscriberPhone = input.phone ?? subscriber?.phone;
  const notification = await tenantDb.notification.create({
    data: {
      organization_id: input.organizationId,
      user_id: input.userId,
      subscriber_id: input.subscriberId,
      type: input.type,
      message: input.message,
      status: "PENDING",
      recipient_id: input.recipientId ?? input.userId ?? input.subscriberId,
      channel,
      subject: input.subject,
      body: input.message,
      retry_of_id: input.retryOfId,
    },
    select: { id: true },
  });

  try {
    if (channel === "EMAIL") await sendEmail(input);
    if (channel === "SMS") {
      if (input.smsApiKey && input.smsSender) await sendArkeselSms(subscriberPhone ?? input.phone ?? "", input.message, { ...input, arkeselApiKey: input.smsApiKey, arkeselSender: input.smsSender });
      else if (process.env.ARKESEL_API_KEY && process.env.SMS_SENDER_ID) await sendArkeselSms(subscriberPhone ?? input.phone ?? "", input.message, input);
      else await sendSms(input);
    }

    await tenantDb.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sent_at: new Date() },
    });

    if (channel !== "SMS" && ARKESEL_SMS_TYPES.has(input.type) && validPhoneNumber(subscriberPhone)) {
      void sendArkeselSms(subscriberPhone, input.message, input).catch((error) => {
        console.error(`[notifications] Arkesel SMS failed for ${notification.id}:`, error);
      });
    }

    return { id: notification.id, status: "SENT" };
  } catch (error) {
    const providerError = error instanceof Error ? error.message : String(error);
    await tenantDb.notification.update({
      where: { id: notification.id },
      data: { status: "FAILED", error: providerError },
    });
    return { id: notification.id, status: "FAILED", providerError };
  }
}
