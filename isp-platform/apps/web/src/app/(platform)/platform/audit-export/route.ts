import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getPlatformAuditLogs } from "@/lib/api/platform-administration";
function cell(value: string | Date): string { return `"${String(value instanceof Date ? value.toISOString() : value).replaceAll('"', '""')}"`; }
export async function GET(request: Request) {
  await requireRole("PLATFORM_ADMIN");
  const params = new URL(request.url).searchParams;
  const logs = await getPlatformAuditLogs({ action: params.get("action") ?? undefined, entity: params.get("entity") ?? undefined, limit: 200 });
  const csv = [["Action", "Entity", "Entity ID", "Actor ID", "Created At"], ...logs.map((log) => [log.action, log.entity, log.entity_id, log.actor_id, log.created_at])].map((row) => row.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=platform-audit.csv" } });
}
