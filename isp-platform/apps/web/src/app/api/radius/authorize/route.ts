import { NextRequest, NextResponse } from "next/server";
import { createTenantClient } from "database";
import { authenticateChap, authenticateMsChapV2, authenticatePap } from "radius";

import { authorizeOrganizationApiKey } from "../../../../lib/api-keys";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function decodeBase64Field(value: unknown, fieldName: string): Buffer {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error(`${fieldName} must be valid base64.`);
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length === 0) {
    throw new Error(`${fieldName} must decode to at least one byte.`);
  }
  return decoded;
}

function parseChapIdentifier(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error("chapIdentifier must be an integer between 0 and 255.");
  }
  return parsed;
}

/**
 * Bridges FreeRADIUS to Postgres (e.g. via `rlm_rest`): the NAS/RADIUS server
 * posts the subscriber's credentials here and gets back an accept/reject
 * decision plus reply attributes (session timeout, reply message).
 *
 * Binary RADIUS attributes (challenges/responses) travel as base64 strings.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.organizationSlug !== "string" || typeof body.username !== "string" || typeof body.protocol !== "string") {
    return NextResponse.json(
      { accept: false, reason: "organizationSlug, protocol, and username are required." },
      { status: 400 }
    );
  }

  const authorization = await authorizeOrganizationApiKey(
    request,
    body.organizationSlug,
    "radius:authorize"
  );
  if (!authorization.ok) {
    return NextResponse.json(
      { accept: false, reason: authorization.reason },
      { status: authorization.status }
    );
  }

  const tenantDb = createTenantClient(prisma, authorization.organizationId);

  try {
    switch (body.protocol) {
      case "pap": {
        if (typeof body.password !== "string" || !body.password) {
          return NextResponse.json(
            { accept: false, reason: "password is required for pap." },
            { status: 400 }
          );
        }
        const result = await authenticatePap(tenantDb, {
          username: body.username,
          password: body.password,
        });
        return NextResponse.json(result);
      }
      case "chap": {
        let chapIdentifier: number;
        let chapChallenge: Buffer;
        let chapResponse: Buffer;
        try {
          chapIdentifier = parseChapIdentifier(body.chapIdentifier);
          chapChallenge = decodeBase64Field(body.chapChallenge, "chapChallenge");
          chapResponse = decodeBase64Field(body.chapResponse, "chapResponse");
        } catch (error) {
          return NextResponse.json(
            { accept: false, reason: error instanceof Error ? error.message : "Malformed CHAP payload." },
            { status: 400 }
          );
        }

        const result = await authenticateChap(tenantDb, {
          username: body.username,
          chapIdentifier,
          chapChallenge,
          chapResponse,
        });
        return NextResponse.json(result);
      }
      case "mschapv2": {
        let authenticatorChallenge: Buffer;
        let peerChallenge: Buffer;
        let ntResponse: Buffer;
        try {
          authenticatorChallenge = decodeBase64Field(
            body.authenticatorChallenge,
            "authenticatorChallenge"
          );
          peerChallenge = decodeBase64Field(body.peerChallenge, "peerChallenge");
          ntResponse = decodeBase64Field(body.ntResponse, "ntResponse");
        } catch (error) {
          return NextResponse.json(
            { accept: false, reason: error instanceof Error ? error.message : "Malformed MS-CHAPv2 payload." },
            { status: 400 }
          );
        }

        const result = await authenticateMsChapV2(tenantDb, {
          username: body.username,
          authenticatorChallenge,
          peerChallenge,
          ntResponse,
        });
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { accept: false, reason: "protocol must be one of pap, chap, mschapv2." },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { accept: false, reason: err instanceof Error ? err.message : "Internal error." },
      { status: 500 }
    );
  }
}
