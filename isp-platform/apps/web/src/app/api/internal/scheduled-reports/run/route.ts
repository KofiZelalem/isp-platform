import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runDueScheduledReports } from "@/lib/api/scheduled-reports";

function validWorkerSecret(request: Request): boolean {
  const configured = process.env.ISP_OS_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;

  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!validWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const results = await runDueScheduledReports();
  return NextResponse.json({ processed: results.length, results });
}
