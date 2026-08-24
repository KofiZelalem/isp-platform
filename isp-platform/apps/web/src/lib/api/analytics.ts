import "server-only";

import { createTenantClient } from "database";

import { prisma } from "@/lib/db";

export type AnalyticsRange = 7 | 30 | 90;
export type Currency = string;

export type DailyRevenuePoint = {
  date: string;
  revenue: number;
};

export type PackagePopularityItem = {
  planId: string;
  planName: string;
  subscriptions: number;
  revenue: number;
};

export type RouterUsageItem = {
  nodeId: string;
  nodeName: string;
  dataGb: number;
  sessions: number;
};

export type SubscriberTrendPoint = {
  date: string;
  newSubscribers: number;
  churnedSubscribers: number;
  netChange: number;
};

export type PaymentStatusTrendPoint = {
  status: string;
  count: number;
  amount: number;
};

export type SessionConcurrencyPoint = {
  date: string;
  peakConcurrent: number;
};

export type VoucherPerformance = {
  generated: number;
  sold: number;
  redeemed: number;
  revoked: number;
  expired: number;
};

export type ResellerPerformanceItem = {
  resellerId: string;
  resellerName: string;
  voucherBatches: number;
  vouchersRedeemed: number;
  salesAmount: number;
};

export type SessionDurationBucket = {
  label: string;
  sessions: number;
};

export type AnalyticsForecast = {
  nextPeriodRevenue: number;
  nextPeriodNetSubscriberChange: number;
  confidence: number;
  quality: "INSUFFICIENT" | "LIMITED" | "GOOD" | "STRONG";
  method: "ROBUST_MEDIAN_SLOPE";
};

export type ForecastSeriesResult = {
  nextValue: number;
  confidence: number;
  quality: AnalyticsForecast["quality"];
  method: AnalyticsForecast["method"];
};

export type AnalyticsSnapshot = {
  rangeDays: AnalyticsRange;
  startDate: string;
  endDate: string;
  totalRevenue: number;
  previousRevenue: number;
  revenueGrowthRate: number | null;
  activeSubscribers: number;
  expiredSubscriptions: number;
  arpu: number;
  totalDataGb: number;
  packagePopularity: PackagePopularityItem[];
  dailyRevenue: DailyRevenuePoint[];
  routerUsage: RouterUsageItem[];
  subscriberTrend: SubscriberTrendPoint[];
  paymentStatusTrend: PaymentStatusTrendPoint[];
  sessionConcurrency: SessionConcurrencyPoint[];
  voucherPerformance: VoucherPerformance;
  resellerPerformance: ResellerPerformanceItem[];
  sessionDuration: SessionDurationBucket[];
  paymentSuccessRate: number;
  voucherRedemptionRate: number;
  averageSessionDurationMinutes: number;
  forecast: AnalyticsForecast;
  currency: Currency;
};

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateRange(rangeDays: AnalyticsRange) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - rangeDays + 1);

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - rangeDays + 1);

  return { start, end, previousStart, previousEnd };
}

function readPlanId(providerResponse: unknown): string | null {
  if (!providerResponse || typeof providerResponse !== "object" || Array.isArray(providerResponse)) {
    return null;
  }
  const planId = (providerResponse as Record<string, unknown>).plan_id;
  return typeof planId === "string" ? planId : null;
}

/** Forecasts the next point using the median of pairwise slopes, limiting outlier impact. */
export function forecastSeries(values: number[]): ForecastSeriesResult {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { nextValue: 0, confidence: 0, quality: "INSUFFICIENT", method: "ROBUST_MEDIAN_SLOPE" };
  if (finite.length === 1) return { nextValue: Math.max(0, finite[0]), confidence: 10, quality: "INSUFFICIENT", method: "ROBUST_MEDIAN_SLOPE" };

  const slopes: number[] = [];
  for (let left = 0; left < finite.length - 1; left++) {
    for (let right = left + 1; right < finite.length; right++) slopes.push((finite[right] - finite[left]) / (right - left));
  }
  slopes.sort((a, b) => a - b);
  const median = slopes[Math.floor(slopes.length / 2)] ?? 0;
  const predicted = finite[finite.length - 1] + median;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const absoluteDeviation = finite.reduce((sum, value) => sum + Math.abs(value - mean), 0) / finite.length;
  const normalizedError = absoluteDeviation / Math.max(Math.abs(mean), 1);
  const confidence = Math.max(0, Math.min(100, Math.round((1 - normalizedError) * Math.min(100, finite.length / 14 * 100))));
  const quality = finite.length < 3 ? "INSUFFICIENT" : finite.length < 7 ? "LIMITED" : confidence >= 70 ? "STRONG" : "GOOD";

  return { nextValue: Math.max(0, Number(predicted.toFixed(2))), confidence, quality, method: "ROBUST_MEDIAN_SLOPE" };
}

/** Aggregates tenant revenue, subscriber, usage, and package metrics for a date range. */
export async function getAnalyticsForOrganization(
  organizationId: string,
  rangeDays: AnalyticsRange
): Promise<AnalyticsSnapshot> {
  const tenantDb = createTenantClient(prisma, organizationId);
  const { start, end, previousStart, previousEnd } = dateRange(rangeDays);

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { currency: true },
  });
  const [payments, allPayments, previousPayments, activeSubscribers, expiredSubscriptions, sessions, subscriptions, plans, newSubscribers, churnedSubscriptions, vouchers] =
    await Promise.all([
      tenantDb.payment.findMany({
        where: { status: "SUCCESS", paid_at: { gte: start, lte: end } },
        select: {
          amount: true,
          paid_at: true,
          provider_response: true,
          invoice: {
            select: {
              subscription: {
                select: { plan: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      tenantDb.payment.findMany({
        where: { created_at: { gte: start, lte: end } },
        select: { status: true, amount: true },
      }),
      tenantDb.payment.findMany({
        where: { status: "SUCCESS", paid_at: { gte: previousStart, lte: previousEnd } },
        select: { amount: true },
      }),
      tenantDb.subscriber.count({ where: { status: "ACTIVE" } }),
      tenantDb.subscription.count({
        where: {
          status: "EXPIRED",
          expires_at: { gte: start, lte: end },
        },
      }),
      tenantDb.session.findMany({
        where: { started_at: { gte: start, lte: end } },
        select: { started_at: true, ended_at: true, data_up_mb: true, data_down_mb: true, node: { select: { id: true, name: true } } },
      }),
      tenantDb.subscription.findMany({
        where: { started_at: { gte: start, lte: end } },
        select: { plan: { select: { id: true, name: true } } },
      }),
      tenantDb.servicePlan.findMany({
        select: { id: true, name: true },
      }),
      tenantDb.subscriber.findMany({
        where: { created_at: { gte: start, lte: end } },
        select: { created_at: true },
      }),
      tenantDb.subscription.findMany({
        where: { status: "EXPIRED", expires_at: { gte: start, lte: end } },
        select: { expires_at: true },
      }),
      tenantDb.voucher.findMany({
        where: { created_at: { gte: start, lte: end } },
        select: {
          status: true,
          batch: { select: { id: true, reseller_id: true, reseller_profile: { select: { user: { select: { full_name: true, email: true } } } }, selling_price: true } },
        },
      }),
    ]);

  const totalRevenue = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const previousRevenue = previousPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const revenueGrowthRate = previousRevenue
    ? Number((((totalRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1))
    : totalRevenue > 0
      ? null
      : 0;
  const totalDataGb = Number(
    (sessions.reduce((sum, session) => sum + session.data_up_mb + session.data_down_mb, 0) / 1024).toFixed(2)
  );
  const routerMap = new Map<string, RouterUsageItem>();
  for (const session of sessions) {
    const current = routerMap.get(session.node.id) ?? { nodeId: session.node.id, nodeName: session.node.name, dataGb: 0, sessions: 0 };
    current.sessions += 1;
    current.dataGb += (session.data_up_mb + session.data_down_mb) / 1024;
    routerMap.set(current.nodeId, current);
  }

  const packageMap = new Map<string, PackagePopularityItem>();
  for (const plan of plans) {
    packageMap.set(plan.id, { planId: plan.id, planName: plan.name, subscriptions: 0, revenue: 0 });
  }
  for (const subscription of subscriptions) {
    const item = packageMap.get(subscription.plan.id) ?? {
      planId: subscription.plan.id,
      planName: subscription.plan.name,
      subscriptions: 0,
      revenue: 0,
    };
    item.subscriptions += 1;
    packageMap.set(item.planId, item);
  }
  for (const payment of payments) {
    const plan = payment.invoice?.subscription?.plan;
    const planId = plan?.id ?? readPlanId(payment.provider_response);
    if (!planId) continue;
    const item = packageMap.get(planId) ?? {
      planId,
      planName: plan?.name ?? "Unknown package",
      subscriptions: 0,
      revenue: 0,
    };
    item.revenue += Number(payment.amount);
    packageMap.set(planId, item);
  }

  const dailyRevenue = new Map<string, number>();
  const subscriberTrend = new Map<string, SubscriberTrendPoint>();
  const paymentStatusMap = new Map<string, PaymentStatusTrendPoint>();
  const sessionConcurrency = new Map<string, SessionConcurrencyPoint>();
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = utcDay(cursor);
    dailyRevenue.set(date, 0);
    subscriberTrend.set(date, { date, newSubscribers: 0, churnedSubscribers: 0, netChange: 0 });
    sessionConcurrency.set(date, { date, peakConcurrent: 0 });
  }

  const voucherPerformance: VoucherPerformance = { generated: 0, sold: 0, redeemed: 0, revoked: 0, expired: 0 };
  const resellerMap = new Map<string, ResellerPerformanceItem>();
  for (const voucher of vouchers) {
    if (voucher.status === "GENERATED") voucherPerformance.generated += 1;
    if (voucher.status === "SOLD") voucherPerformance.sold += 1;
    if (voucher.status === "REDEEMED") voucherPerformance.redeemed += 1;
    if (voucher.status === "REVOKED") voucherPerformance.revoked += 1;
    if (voucher.status === "EXPIRED") voucherPerformance.expired += 1;
    const resellerId = voucher.batch.reseller_id;
    if (resellerId) {
      const item = resellerMap.get(resellerId) ?? { resellerId, resellerName: voucher.batch.reseller_profile?.user.full_name || voucher.batch.reseller_profile?.user.email || "Unknown reseller", voucherBatches: 0, vouchersRedeemed: 0, salesAmount: 0 };
      if (voucher.status === "REDEEMED") item.vouchersRedeemed += 1;
      if (voucher.status === "REDEEMED" || voucher.status === "SOLD") item.salesAmount += Number(voucher.batch.selling_price);
      resellerMap.set(resellerId, item);
    }
  }
  for (const item of resellerMap.values()) item.voucherBatches = new Set(vouchers.filter((voucher) => voucher.batch.reseller_id === item.resellerId).map((voucher) => voucher.batch.id)).size;
  const durationCounts = new Map<string, number>([["< 15 min", 0], ["15-60 min", 0], ["1-4 hours", 0], ["> 4 hours", 0]]);
  let totalDurationSec = 0;
  for (const session of sessions) {
    const durationSec = session.ended_at ? Math.max(0, (session.ended_at.getTime() - session.started_at.getTime()) / 1000) : Math.max(0, (end.getTime() - session.started_at.getTime()) / 1000);
    totalDurationSec += durationSec;
    const label = durationSec < 900 ? "< 15 min" : durationSec < 3600 ? "15-60 min" : durationSec < 14400 ? "1-4 hours" : "> 4 hours";
    durationCounts.set(label, (durationCounts.get(label) ?? 0) + 1);
  }
  const successPayments = allPayments.filter((payment) => payment.status === "SUCCESS").length;
  const paymentSuccessRate = allPayments.length ? Number(((successPayments / allPayments.length) * 100).toFixed(1)) : 0;
  const totalVouchers = Object.values(voucherPerformance).reduce((total, count) => total + count, 0);
  const voucherRedemptionRate = totalVouchers ? Number(((voucherPerformance.redeemed / totalVouchers) * 100).toFixed(1)) : 0;
  const averageSessionDurationMinutes = sessions.length ? Number((totalDurationSec / sessions.length / 60).toFixed(1)) : 0;
  for (const subscriber of newSubscribers) {
    const point = subscriberTrend.get(utcDay(subscriber.created_at));
    if (point) point.newSubscribers += 1;
  }
  for (const subscription of churnedSubscriptions) {
    if (!subscription.expires_at) continue;
    const point = subscriberTrend.get(utcDay(subscription.expires_at));
    if (point) point.churnedSubscribers += 1;
  }
  for (const point of subscriberTrend.values()) point.netChange = point.newSubscribers - point.churnedSubscribers;

  for (const payment of allPayments) {
    const point = paymentStatusMap.get(payment.status) ?? { status: payment.status, count: 0, amount: 0 };
    point.count += 1;
    point.amount += Number(payment.amount);
    paymentStatusMap.set(point.status, point);
  }

  // Sweep session start/end events for each UTC day. Ongoing sessions remain active through the day's end.
  for (const point of sessionConcurrency.values()) {
    const dayStart = new Date(`${point.date}T00:00:00.000Z`).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const events = new Map<number, number>();
    for (const session of sessions) {
      const sessionStart = session.started_at.getTime();
      const sessionEnd = session.ended_at?.getTime() ?? end.getTime();
      if (sessionStart >= dayEnd || sessionEnd < dayStart) continue;
      const effectiveStart = Math.max(sessionStart, dayStart);
      const effectiveEnd = Math.min(sessionEnd, dayEnd - 1);
      events.set(effectiveStart, (events.get(effectiveStart) ?? 0) + 1);
      events.set(effectiveEnd + 1, (events.get(effectiveEnd + 1) ?? 0) - 1);
    }
    let concurrent = 0;
    for (const change of [...events.entries()].sort(([a], [b]) => a - b)) {
      concurrent += change[1];
      point.peakConcurrent = Math.max(point.peakConcurrent, concurrent);
    }
  }
  for (const payment of payments) {
    if (payment.paid_at) {
      const day = utcDay(payment.paid_at);
      dailyRevenue.set(day, (dailyRevenue.get(day) ?? 0) + Number(payment.amount));
    }
  }

  const revenueForecast = forecastSeries([...dailyRevenue.values()]);
  const subscriberForecast = forecastSeries([...subscriberTrend.values()].map((point) => point.netChange));

  return {
    rangeDays,
    startDate: utcDay(start),
    endDate: utcDay(end),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    previousRevenue: Number(previousRevenue.toFixed(2)),
    revenueGrowthRate,
    activeSubscribers,
    expiredSubscriptions,
    arpu: activeSubscribers ? Number((totalRevenue / activeSubscribers).toFixed(2)) : 0,
    totalDataGb,
    packagePopularity: [...packageMap.values()]
      .filter((item) => item.subscriptions > 0 || item.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue || b.subscriptions - a.subscriptions),
    dailyRevenue: [...dailyRevenue.entries()].map(([date, revenue]) => ({
      date,
      revenue: Number(revenue.toFixed(2)),
    })),
        routerUsage: [...routerMap.values()]
          .map((item) => ({ ...item, dataGb: Number(item.dataGb.toFixed(2)) }))
          .sort((a, b) => b.dataGb - a.dataGb),
        subscriberTrend: [...subscriberTrend.values()],
        paymentStatusTrend: [...paymentStatusMap.values()].map((item) => ({ ...item, amount: Number(item.amount.toFixed(2)) })),
        sessionConcurrency: [...sessionConcurrency.values()],
        voucherPerformance,
        resellerPerformance: [...resellerMap.values()].map((item) => ({ ...item, salesAmount: Number(item.salesAmount.toFixed(2)) })).sort((a, b) => b.salesAmount - a.salesAmount),
        sessionDuration: [...durationCounts.entries()].map(([label, count]) => ({ label, sessions: count })),
        paymentSuccessRate,
        voucherRedemptionRate,
        averageSessionDurationMinutes,
        forecast: {
          nextPeriodRevenue: Number(Math.max(0, revenueForecast.nextValue * rangeDays).toFixed(2)),
          nextPeriodNetSubscriberChange: Math.round(subscriberForecast.nextValue),
          confidence: Math.min(revenueForecast.confidence, subscriberForecast.confidence),
          quality: revenueForecast.quality,
          method: "ROBUST_MEDIAN_SLOPE",
        },
    currency: organization?.currency ?? "USD",
  };
}
