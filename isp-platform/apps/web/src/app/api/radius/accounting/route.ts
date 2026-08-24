import { NextRequest, NextResponse } from "next/server";
import { createTenantClient } from "database";
import { handleAccountingStart, handleAccountingStop, handleAccountingUpdate } from "radius";

import { authorizeOrganizationApiKey } from "../../../../lib/api-keys";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function parseNonNegativeInteger(value: unknown, field: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return parsed;
}

/** Bridges FreeRADIUS accounting (Start / Interim-Update / Stop) to Postgres. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.organizationSlug !== "string" || typeof body.type !== "string") {
    return NextResponse.json({ error: "organizationSlug and type are required." }, { status: 400 });
  }

  const authorization = await authorizeOrganizationApiKey(
    request,
    body.organizationSlug,
    "radius:accounting"
  );
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.reason },
      { status: authorization.status }
    );
  }

  const tenantDb = createTenantClient(prisma, authorization.organizationId);

  try {
    switch (body.type) {
      case "start": {
        const radiusSessionId = requiredString(body.radiusSessionId, "radiusSessionId");
        const subscriberId = requiredString(body.subscriberId, "subscriberId");
        const nodeId = requiredString(body.nodeId, "nodeId");
        const session = await handleAccountingStart(tenantDb, {
          organizationId: authorization.organizationId,
          subscriberId,
          nodeId,
          radiusSessionId,
          ipAddress: typeof body.ipAddress === "string" ? body.ipAddress : undefined,
          macAddress: typeof body.macAddress === "string" ? body.macAddress : undefined,
        });
        return NextResponse.json({ session });
      }
      case "interim-update": {
        const radiusSessionId = requiredString(body.radiusSessionId, "radiusSessionId");
        const dataUpMb = parseNonNegativeInteger(body.dataUpMb, "dataUpMb");
        const dataDownMb = parseNonNegativeInteger(body.dataDownMb, "dataDownMb");
        const durationSec = parseNonNegativeInteger(body.durationSec, "durationSec");
        const result = await handleAccountingUpdate(tenantDb, {
          radiusSessionId,
          dataUpMb,
          dataDownMb,
          durationSec,
        });
        return NextResponse.json(result);
      }
      case "stop": {
        const radiusSessionId = requiredString(body.radiusSessionId, "radiusSessionId");
        const session = await handleAccountingStop(tenantDb, {
          radiusSessionId,
          terminationCause: typeof body.terminationCause === "string" ? body.terminationCause : undefined,
        });
        return NextResponse.json({ session });
      }
      default:
        return NextResponse.json({ error: "type must be one of start, interim-update, stop." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Error && / is required\.|must be a non-negative integer\./.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error." },
      { status: 500 }
    );
  }
}
