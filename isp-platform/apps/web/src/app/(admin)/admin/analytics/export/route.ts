import { NextResponse } from "next/server";

import { getAnalyticsForOrganization } from "@/lib/api/analytics";
import { requireCurrentOrganization } from "@/lib/auth";

function parseRange(value: string | null): 7 | 30 | 90 {
  return value === "30" ? 30 : value === "90" ? 90 : 7;
}

function cell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const { organizationId } = await requireCurrentOrganization();
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  const analytics = await getAnalyticsForOrganization(organizationId, range);
  const rows: (string | number)[][] = [
    ["Metric", "Value"],
    ["Start date", analytics.startDate],
    ["End date", analytics.endDate],
    ["Total revenue", analytics.totalRevenue],
    ["Active subscribers", analytics.activeSubscribers],
    ["Total bandwidth GB", analytics.totalDataGb],
    ["Forecast method", analytics.forecast.method],
    ["Forecast quality", analytics.forecast.quality],
    ["Forecast confidence", analytics.forecast.confidence],
    ["Next period revenue forecast", analytics.forecast.nextPeriodRevenue],
    ["Next period subscriber change forecast", analytics.forecast.nextPeriodNetSubscriberChange],
    [],
    ["Payment status", "Count", "Amount"],
    ...analytics.paymentStatusTrend.map((item) => [item.status, item.count, item.amount]),
    [],
    ["Voucher status", "Count"],
    ...Object.entries(analytics.voucherPerformance).map(([status, count]) => [status, count]),
    [],
    ["Router", "Sessions", "Data GB"],
    ...analytics.routerUsage.map((item) => [item.nodeName, item.sessions, item.dataGb]),
    [],
    ["Session duration", "Sessions"],
    ...analytics.sessionDuration.map((item) => [item.label, item.sessions]),
  ];
  const csv = rows.map((row) => row.map((value) => cell(value)).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="analytics-${range}d.csv"` } });
}
