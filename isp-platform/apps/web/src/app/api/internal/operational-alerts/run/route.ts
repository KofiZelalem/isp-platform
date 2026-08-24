import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { deliverOperationalAlerts } from "@/lib/api/operational-alert-delivery";
import { deliverCustomerReminders } from "@/lib/api/customer-reminder-delivery";

function authorized(request: Request): boolean {
  const expected = process.env.ISP_OS_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const [operationalAlerts, customerReminders] = await Promise.all([
    deliverOperationalAlerts(),
    deliverCustomerReminders(),
  ]);
  return NextResponse.json({
    processed: operationalAlerts.length + customerReminders.length,
    operationalAlerts,
    customerReminders,
  });
}
