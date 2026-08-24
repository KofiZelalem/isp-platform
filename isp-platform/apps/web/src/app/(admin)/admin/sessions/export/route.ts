import { NextResponse } from "next/server";

import { requireCurrentOrganization } from "@/lib/auth";
import {
  getRecentSessionsForOrganization,
  serializeSessionHistoryCsv,
} from "@/lib/api/sessions";

function safeFileToken(value: string): string {
  const sanitized = value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-");
  return sanitized || "all";
}

export async function GET(request: Request) {
  const { organizationId } = await requireCurrentOrganization();
  const { searchParams } = new URL(request.url);

  const filterInput = {
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    subscriberId: searchParams.get("subscriberId") ?? undefined,
    nodeId: searchParams.get("nodeId") ?? undefined,
    startedFrom: searchParams.get("startedFrom") ?? undefined,
    startedTo: searchParams.get("startedTo") ?? undefined,
  };

  const firstPage = await getRecentSessionsForOrganization(organizationId, {
    ...filterInput,
    page: 1,
    pageSize: 100,
  });

  const items = [...firstPage.items];
  for (let page = 2; page <= firstPage.totalPages; page++) {
    const nextPage = await getRecentSessionsForOrganization(organizationId, {
      ...filterInput,
      page,
      pageSize: 100,
    });
    items.push(...nextPage.items);
  }

  const csv = serializeSessionHistoryCsv(items);
  const fileName = [
    "session-history",
    safeFileToken(filterInput.status ?? "all-statuses"),
    safeFileToken(filterInput.startedFrom ?? "start"),
    safeFileToken(filterInput.startedTo ?? "end"),
  ].join("_");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}.csv"`,
    },
  });
}
