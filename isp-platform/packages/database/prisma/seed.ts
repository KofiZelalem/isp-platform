import { Buffer } from "buffer";
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from "crypto";
import process from "process";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_IDS = {
  platformAdmin: "00000000-0000-0000-0000-000000000001",
  nexaAdmin: "00000000-0000-0000-0000-000000000002",
} as const;

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const daysAgo = (days: number) => daysFromNow(-days);

const DEV_API_KEYS = {
  nexaRadius: "dev-nexa-radius-key",
  alphaRadius: "dev-alpha-radius-key",
} as const;

const hashApiKey = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function encodeNodeCredential(plain: string): string {
  const masterKey =
    process.env.ISP_OS_CREDENTIALS_ENCRYPTION_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "isp-os-development-key";
  const salt = Buffer.from("credential-encryption-v1", "utf8");
  const key = pbkdf2Sync(masterKey, salt, 100_000, 32, "sha256");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

async function findOrCreateNode(data: {
  organization_id: string;
  name: string;
  node_type: "MIKROTIK" | "FREERADIUS";
  ip_address: string;
  port: number;
  username_enc: string;
  password_enc: string;
  location: string;
}) {
  const existing = await prisma.networkNode.findFirst({
    where: { organization_id: data.organization_id, name: data.name },
  });

  const nodeData = {
    ...data,
    status: "ONLINE" as const,
    last_seen_at: new Date(),
  };

  return existing
    ? prisma.networkNode.update({ where: { id: existing.id }, data: nodeData })
    : prisma.networkNode.create({ data: nodeData });
}

async function findOrCreatePlan(data: {
  organization_id: string;
  name: string;
  description: string;
  plan_type: "DATA_BASED" | "UNLIMITED";
  plan_period: "DAILY" | "WEEKLY" | "MONTHLY";
  price: number;
  data_limit_mb: number | null;
  speed_upload_kbps: number;
  speed_download_kbps: number;
  validity_days: number;
  mikrotik_profile: string;
  radius_group: string;
}) {
  const existing = await prisma.servicePlan.findFirst({
    where: { organization_id: data.organization_id, name: data.name },
  });

  const planData = { ...data, is_active: true, is_public: true };

  return existing
    ? prisma.servicePlan.update({ where: { id: existing.id }, data: planData })
    : prisma.servicePlan.create({ data: planData });
}

async function findOrCreateApiKey(data: {
  organization_id: string;
  name: string;
  plaintextKey: string;
  scopes: string[];
}) {
  const keyHash = hashApiKey(data.plaintextKey);
  const existing = await prisma.apiKey.findFirst({
    where: { organization_id: data.organization_id, name: data.name },
    select: { id: true },
  });

  const apiKeyData = {
    organization_id: data.organization_id,
    name: data.name,
    key_hash: keyHash,
    scopes: data.scopes,
    is_active: true,
    expires_at: null,
  };

  return existing
    ? prisma.apiKey.update({ where: { id: existing.id }, data: apiKeyData })
    : prisma.apiKey.create({ data: apiKeyData });
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ISP_OS_ALLOW_SEED !== "true") {
    throw new Error(
      "Refusing to run the development seed against a production environment. " +
        "Set ISP_OS_ALLOW_SEED=true only if you intentionally want deterministic dev data seeded here."
    );
  }

  console.log("Starting ISP-OS database seed...");

  // Users require an organization in the current schema, so the platform admin
  // belongs to a dedicated meta-organization rather than either ISP tenant.
  const platformOrganization = await prisma.organization.upsert({
    where: { slug: "isp-os-platform" },
    update: {
      name: "ISP-OS Platform",
      status: "ACTIVE",
      plan_tier: "enterprise",
      country: "GH",
      currency: "USD",
      timezone: "UTC",
    },
    create: {
      name: "ISP-OS Platform",
      slug: "isp-os-platform",
      status: "ACTIVE",
      plan_tier: "enterprise",
      country: "GH",
      currency: "USD",
      timezone: "UTC",
    },
  });

  await prisma.user.upsert({
    where: { supabase_uid: SEED_IDS.platformAdmin },
    update: {
      organization_id: platformOrganization.id,
      email: "platform-admin@isp-os.test",
      full_name: "Platform Administrator",
      phone: "+233000000000",
      role: "PLATFORM_ADMIN",
      is_active: true,
    },
    create: {
      organization_id: platformOrganization.id,
      supabase_uid: SEED_IDS.platformAdmin,
      email: "platform-admin@isp-os.test",
      full_name: "Platform Administrator",
      phone: "+233000000000",
      role: "PLATFORM_ADMIN",
      is_active: true,
    },
  });

  const [nexa, alpha] = await Promise.all([
    prisma.organization.upsert({
      where: { slug: "nexa-hotspot" },
      update: {
        name: "Nexa Hotspot ISP",
        status: "ACTIVE",
        plan_tier: "growth",
        country: "GH",
        currency: "GHS",
        timezone: "Africa/Accra",
      },
      create: {
        name: "Nexa Hotspot ISP",
        slug: "nexa-hotspot",
        status: "ACTIVE",
        plan_tier: "growth",
        country: "GH",
        currency: "GHS",
        timezone: "Africa/Accra",
      },
    }),
    prisma.organization.upsert({
      where: { slug: "alpha-wireless" },
      update: {
        name: "Alpha Wireless",
        status: "ACTIVE",
        plan_tier: "starter",
        country: "GH",
        currency: "GHS",
        timezone: "Africa/Accra",
      },
      create: {
        name: "Alpha Wireless",
        slug: "alpha-wireless",
        status: "ACTIVE",
        plan_tier: "starter",
        country: "GH",
        currency: "GHS",
        timezone: "Africa/Accra",
      },
    }),
  ]);

  const nexaAdmin = await prisma.user.upsert({
    where: { supabase_uid: SEED_IDS.nexaAdmin },
    update: {
      organization_id: nexa.id,
      email: "admin@nexa-hotspot.test",
      full_name: "Nexa ISP Administrator",
      phone: "+233244000001",
      role: "ISP_ADMIN",
      is_active: true,
    },
    create: {
      organization_id: nexa.id,
      supabase_uid: SEED_IDS.nexaAdmin,
      email: "admin@nexa-hotspot.test",
      full_name: "Nexa ISP Administrator",
      phone: "+233244000001",
      role: "ISP_ADMIN",
      is_active: true,
    },
  });

  const [mikrotik, radius] = await Promise.all([
    findOrCreateNode({
      organization_id: nexa.id,
      name: "Nexa MikroTik - Main Hub",
      node_type: "MIKROTIK",
      ip_address: "192.168.88.1",
      port: 8728,
      username_enc: encodeNodeCredential("admin"),
      password_enc: encodeNodeCredential("seed-only-router-password"),
      location: "Accra Central Exchange",
    }),
    findOrCreateNode({
      organization_id: nexa.id,
      name: "Nexa FreeRADIUS - Auth Server",
      node_type: "FREERADIUS",
      ip_address: "10.0.0.10",
      port: 1812,
      username_enc: encodeNodeCredential("radius"),
      password_enc: encodeNodeCredential("seed-only-radius-password"),
      location: "Accra Data Centre",
    }),
  ]);

  await Promise.all([
    findOrCreateApiKey({
      organization_id: nexa.id,
      name: "Seeded RADIUS REST key",
      plaintextKey: DEV_API_KEYS.nexaRadius,
      scopes: ["radius:authorize", "radius:accounting"],
    }),
    findOrCreateApiKey({
      organization_id: alpha.id,
      name: "Seeded RADIUS REST key",
      plaintextKey: DEV_API_KEYS.alphaRadius,
      scopes: ["radius:authorize", "radius:accounting"],
    }),
  ]);

  const [daily, weekly, monthly] = await Promise.all([
    findOrCreatePlan({
      organization_id: nexa.id,
      name: "Daily 5GB",
      description: "5 GB of data, valid for one day.",
      plan_type: "DATA_BASED",
      plan_period: "DAILY",
      price: 10,
      data_limit_mb: 5_120,
      speed_upload_kbps: 5_120,
      speed_download_kbps: 10_240,
      validity_days: 1,
      mikrotik_profile: "daily-5gb",
      radius_group: "daily-5gb",
    }),
    findOrCreatePlan({
      organization_id: nexa.id,
      name: "Weekly 20GB",
      description: "20 GB of data, valid for seven days.",
      plan_type: "DATA_BASED",
      plan_period: "WEEKLY",
      price: 40,
      data_limit_mb: 20_480,
      speed_upload_kbps: 10_240,
      speed_download_kbps: 20_480,
      validity_days: 7,
      mikrotik_profile: "weekly-20gb",
      radius_group: "weekly-20gb",
    }),
    findOrCreatePlan({
      organization_id: nexa.id,
      name: "Monthly Unlimited",
      description: "Unlimited data for 30 days; fair-use policy applies.",
      plan_type: "UNLIMITED",
      plan_period: "MONTHLY",
      price: 150,
      data_limit_mb: null,
      speed_upload_kbps: 20_480,
      speed_download_kbps: 51_200,
      validity_days: 30,
      mikrotik_profile: "monthly-unlimited",
      radius_group: "monthly-unlimited",
    }),
  ]);

  const subscribers = [
    {
      username: "kwame.asante",
      fullName: "Kwame Asante",
      email: "kwame.asante@example.gh",
      phone: "+233244100001",
      plan: monthly,
      startedDaysAgo: 10,
      dataUsedMb: 6_120,
    },
    {
      username: "ama.boateng",
      fullName: "Ama Boateng",
      email: "ama.boateng@example.gh",
      phone: "+233244100002",
      plan: weekly,
      startedDaysAgo: 2,
      dataUsedMb: 3_480,
    },
    {
      username: "kofi.mensah",
      fullName: "Kofi Mensah",
      email: "kofi.mensah@example.gh",
      phone: "+233244100003",
      plan: monthly,
      startedDaysAgo: 7,
      dataUsedMb: 12_410,
    },
    {
      username: "akua.frimpong",
      fullName: "Akua Frimpong",
      email: "akua.frimpong@example.gh",
      phone: "+233244100004",
      plan: daily,
      startedDaysAgo: 0,
      dataUsedMb: 740,
    },
    {
      username: "yaw.darko",
      fullName: "Yaw Darko",
      email: "yaw.darko@example.gh",
      phone: "+233244100005",
      plan: weekly,
      startedDaysAgo: 1,
      dataUsedMb: 1_920,
    },
  ];

  for (const [index, seedSubscriber] of subscribers.entries()) {
    const subscriber = await prisma.subscriber.upsert({
      where: {
        organization_id_username: {
          organization_id: nexa.id,
          username: seedSubscriber.username,
        },
      },
      update: {
        password_hash: "seed-password-hash-not-for-production",
        full_name: seedSubscriber.fullName,
        email: seedSubscriber.email,
        phone: seedSubscriber.phone,
        status: "ACTIVE",
        kyc_verified: true,
      },
      create: {
        organization_id: nexa.id,
        username: seedSubscriber.username,
        password_hash: "seed-password-hash-not-for-production",
        full_name: seedSubscriber.fullName,
        email: seedSubscriber.email,
        phone: seedSubscriber.phone,
        status: "ACTIVE",
        kyc_verified: true,
      },
    });

    const startedAt = daysAgo(seedSubscriber.startedDaysAgo);
    const expiresAt = daysFromNow(
      seedSubscriber.plan.validity_days - seedSubscriber.startedDaysAgo
    );
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        organization_id: nexa.id,
        subscriber_id: subscriber.id,
        plan_id: seedSubscriber.plan.id,
      },
    });
    const subscriptionData = {
      status: "ACTIVE" as const,
      started_at: startedAt,
      expires_at: expiresAt,
      data_used_mb: seedSubscriber.dataUsedMb,
      auto_renew: true,
    };
    const subscription = existingSubscription
      ? await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: subscriptionData,
        })
      : await prisma.subscription.create({
          data: {
            organization_id: nexa.id,
            subscriber_id: subscriber.id,
            plan_id: seedSubscriber.plan.id,
            ...subscriptionData,
          },
        });

    const invoiceNumber = `SEED-NEXA-${String(index + 1).padStart(3, "0")}`;
    const invoice = await prisma.invoice.upsert({
      where: {
        organization_id_invoice_number: {
          organization_id: nexa.id,
          invoice_number: invoiceNumber,
        },
      },
      update: {
        subscriber_id: subscriber.id,
        subscription_id: subscription.id,
        status: "PAID",
        subtotal: seedSubscriber.plan.price,
        tax: 0,
        total: seedSubscriber.plan.price,
        due_date: startedAt,
        paid_at: startedAt,
        line_items: [
          {
            description: `${seedSubscriber.plan.name} subscription`,
            quantity: 1,
            unit_price: Number(seedSubscriber.plan.price),
            total: Number(seedSubscriber.plan.price),
          },
        ],
      },
      create: {
        organization_id: nexa.id,
        subscriber_id: subscriber.id,
        subscription_id: subscription.id,
        invoice_number: invoiceNumber,
        status: "PAID",
        subtotal: seedSubscriber.plan.price,
        tax: 0,
        total: seedSubscriber.plan.price,
        due_date: startedAt,
        paid_at: startedAt,
        line_items: [
          {
            description: `${seedSubscriber.plan.name} subscription`,
            quantity: 1,
            unit_price: Number(seedSubscriber.plan.price),
            total: Number(seedSubscriber.plan.price),
          },
        ],
      },
    });

    const paymentReference = `SEED-PAYMENT-${String(index + 1).padStart(3, "0")}`;
    const existingPayment = await prisma.payment.findFirst({
      where: { organization_id: nexa.id, provider_ref: paymentReference },
    });
    const paymentData = {
      internal_reference: `SEED-INTERNAL-${String(index + 1).padStart(3, "0")}`,
      subscriber_id: subscriber.id,
      subscription_id: subscription.id,
      invoice_id: invoice.id,
      amount: seedSubscriber.plan.price,
      currency: "GHS",
      provider: "MANUAL" as const,
      status: "SUCCESS" as const,
      provider_ref: paymentReference,
      paid_at: startedAt,
    };
    if (existingPayment) {
      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: paymentData,
      });
    } else {
      await prisma.payment.create({
        data: { organization_id: nexa.id, ...paymentData },
      });
    }

    await prisma.wallet.upsert({
      where: { subscriber_id: subscriber.id },
      update: { organization_id: nexa.id, balance: 0, currency: "GHS" },
      create: {
        organization_id: nexa.id,
        subscriber_id: subscriber.id,
        balance: 0,
        currency: "GHS",
      },
    });

    // Two closed sessions per subscriber make historical usage available in a
    // fresh installation without adding more records on subsequent seed runs.
    for (let sessionIndex = 0; sessionIndex < 2; sessionIndex += 1) {
      const radiusSession = `SEED-RADIUS-${String(index + 1).padStart(3, "0")}-${sessionIndex + 1}`;
      const existingSession = await prisma.session.findFirst({
        where: { organization_id: nexa.id, radius_session: radiusSession },
      });
      const started = daysAgo(seedSubscriber.startedDaysAgo + sessionIndex + 1);
      const durationSeconds = 3_600 + index * 300 + sessionIndex * 900;
      const sessionData = {
        subscriber_id: subscriber.id,
        node_id: mikrotik.id,
        radius_session: radiusSession,
        ip_address: `10.10.${index + 10}.${sessionIndex + 20}`,
        mac_address: `02:10:00:${String(index + 1).padStart(2, "0")}:${String(
          sessionIndex + 1
        ).padStart(2, "0")}:01`,
        status: "TERMINATED" as const,
        started_at: started,
        ended_at: new Date(started.getTime() + durationSeconds * 1_000),
        data_up_mb: 120 + index * 20 + sessionIndex * 15,
        data_down_mb: 680 + index * 140 + sessionIndex * 75,
        duration_sec: durationSeconds,
        termination_cause: "User-Request",
      };
      if (existingSession) {
        await prisma.session.update({
          where: { id: existingSession.id },
          data: sessionData,
        });
      } else {
        await prisma.session.create({
          data: { organization_id: nexa.id, ...sessionData },
        });
      }
    }
  }

  const voucherBatchName = "Nexa Seed Voucher Batch";
  const existingBatch = await prisma.voucherBatch.findFirst({
    where: { organization_id: nexa.id, name: voucherBatchName },
  });
  const voucherBatchData = {
    plan_id: monthly.id,
    name: voucherBatchName,
    prefix: "NXA",
    quantity: 50,
    selling_price: 150,
    generated_by: nexaAdmin.id,
  };
  const voucherBatch = existingBatch
    ? await prisma.voucherBatch.update({
        where: { id: existingBatch.id },
        data: voucherBatchData,
      })
    : await prisma.voucherBatch.create({
        data: { organization_id: nexa.id, ...voucherBatchData },
      });

  await prisma.voucher.createMany({
    data: Array.from({ length: 50 }, (_, index) => ({
      organization_id: nexa.id,
      batch_id: voucherBatch.id,
      code: `NXA-SEED-${String(index + 1).padStart(3, "0")}`,
      status: "GENERATED" as const,
      expires_at: daysFromNow(60),
    })),
    skipDuplicates: true,
  });

  // Keep the data needed for a repeated seed stable, including the expiry date
  // and batch association of codes that were inserted by a prior seed run.
  await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      prisma.voucher.updateMany({
        where: {
          organization_id: nexa.id,
          code: `NXA-SEED-${String(index + 1).padStart(3, "0")}`,
        },
        data: {
          batch_id: voucherBatch.id,
          status: "GENERATED",
          expires_at: daysFromNow(60),
        },
      })
    )
  );

  console.log("Seed complete.");
  console.log(`Platform admin: platform-admin@isp-os.test`);
  console.log(`ISP organizations: ${nexa.name}, ${alpha.name}`);
  console.log("Nexa data: 2 nodes, 3 plans, 5 subscribers, 10 sessions, 50 vouchers.");
  console.log(`Seeded RADIUS REST API keys for: ${Object.keys(DEV_API_KEYS).join(", ")} (values are development-only, not printed).`);
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
