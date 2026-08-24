import { NextResponse } from "next/server";

import { requireCurrentOrganization } from "@/lib/auth";
import { getReportDownloadForOrganization } from "@/lib/api/reports";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { organizationId } = await requireCurrentOrganization();
  const { id } = await context.params;

  const report = await getReportDownloadForOrganization(organizationId, id);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return new NextResponse(report.content, {
    headers: {
      "Content-Type": `${report.contentType}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${report.fileName}"`,
    },
  });
}
