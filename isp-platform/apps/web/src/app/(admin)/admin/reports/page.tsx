import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireCurrentOrganization } from "@/lib/auth";
import { listReportsForOrganization, reportTypeLabel } from "@/lib/api/reports";
import { listScheduledReportsForOrganization } from "@/lib/api/scheduled-reports";

import { GenerateReportCard } from "./generate-report-card";
import { ScheduleCard } from "./schedule-card";
import { ScheduleToggle } from "./schedule-toggle";

export const dynamic = "force-dynamic";

function statusVariant(status: "PENDING" | "COMPLETED" | "FAILED") {
  if (status === "COMPLETED") return "default" as const;
  if (status === "FAILED") return "destructive" as const;
  return "secondary" as const;
}

export default async function ReportsPage() {
  const { organizationId } = await requireCurrentOrganization();
  const [reports, schedules] = await Promise.all([
    listReportsForOrganization(organizationId),
    listScheduledReportsForOrganization(organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Generate tenant-scoped session and usage CSV reports for explicit date windows.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate report</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateReportCard />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScheduleCard />
          <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>{reportTypeLabel(schedule.type)}</TableCell>
                    <TableCell>{schedule.frequency}</TableCell>
                    <TableCell><Badge variant={schedule.enabled ? "default" : "secondary"}>{schedule.enabled ? "ENABLED" : "DISABLED"}</Badge></TableCell>
                    <TableCell>{new Date(schedule.nextRunAt).toLocaleString()}</TableCell>
                    <TableCell>{schedule.lastRunAt ? `${schedule.lastStatus ?? "PENDING"} · ${new Date(schedule.lastRunAt).toLocaleString()}` : "Never"}</TableCell>
                    <TableCell>{schedule.deliveryChannel}{schedule.deliveryTarget ? ` · ${schedule.deliveryTarget}` : ""}</TableCell>
                    <TableCell className="text-right"><ScheduleToggle id={schedule.id} enabled={schedule.enabled} /></TableCell>
                  </TableRow>
                ))}
                {schedules.length === 0 && <TableRow><TableCell colSpan={7} className="h-20 text-center text-muted-foreground">No schedules configured.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Generated at</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{reportTypeLabel(report.type)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(report.status)}>{report.status}</Badge>
                      {report.error && <p className="text-xs text-destructive mt-1">{report.error}</p>}
                    </TableCell>
                    <TableCell>
                      <div>{new Date(report.windowStart).toLocaleDateString()}</div>
                      <div className="text-muted-foreground">to {new Date(report.windowEnd).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell>{report.rowCount}</TableCell>
                    <TableCell>{report.requestedBy.name}</TableCell>
                    <TableCell>
                      {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {report.status === "COMPLETED" ? (
                        <Link
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                          href={`/admin/reports/${report.id}/download`}
                        >
                          CSV
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unavailable</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {reports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No reports generated yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
