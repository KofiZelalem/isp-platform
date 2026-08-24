import "server-only";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe. Intentionally returns no configuration, secrets, or stack traces —
 * only whether the process is up and whether it can currently reach the database.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "degraded", database: "error" }, { status: 503 });
  }
}
