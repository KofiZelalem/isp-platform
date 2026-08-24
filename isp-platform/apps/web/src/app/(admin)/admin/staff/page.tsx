import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireCurrentOrganization } from "@/lib/auth"
import { getStaffForOrganization } from "@/lib/api/staff"
import { getInvitationsForOrganization } from "@/lib/api/invitations"

import { ToggleStaffActiveButton } from "./toggle-staff-active-button"
import { InviteForm } from "./invite-form"
import { InvitationControls } from "./invitation-controls"
import { RoleControl } from "./role-control"
import { PermissionControl } from "./permission-control"

export const dynamic = "force-dynamic"

export default async function StaffPage() {
  const { organizationId } = await requireCurrentOrganization()
  const [staff, invitations] = await Promise.all([
    getStaffForOrganization(organizationId),
    getInvitationsForOrganization(organizationId),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Staff</h1>
        <p className="text-muted-foreground">
          Manage internal operators and administrators for your organization.
        </p>
      </div>

      <InviteForm />

      {invitations.length > 0 && <div className="rounded-md border border-border/50 p-4"><h2 className="mb-3 font-semibold">Recent invitations</h2><div className="space-y-2 text-sm">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-2"><span>{invitation.email} · {invitation.role.toLowerCase()} · expires {invitation.expiresAt.slice(0, 10)}</span><div className="flex items-center gap-2"><Badge variant={invitation.status === "PENDING" ? "secondary" : invitation.status === "ACCEPTED" ? "default" : "destructive"}>{invitation.status.toLowerCase()}</Badge>{invitation.status === "PENDING" && <InvitationControls invitationId={invitation.id} />}</div></div>)}</div></div>}

      <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Name / Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Last login</TableHead>
              <TableHead className="text-right">Role / actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((member) => (
              <TableRow key={member.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{member.fullName ?? "Unnamed"}</span>
                    <span className="text-xs text-muted-foreground">{member.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{member.role.replace("_", " ")}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={member.isActive ? "default" : "destructive"}>
                    {member.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {member.lastLoginAt?.slice(0, 10) ?? "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-2"><RoleControl userId={member.id} role={member.role} />{member.role !== "ISP_ADMIN" && <PermissionControl userId={member.id} permissions={member.permissions} />}<ToggleStaffActiveButton userId={member.id} isActive={member.isActive} /></div>
                </TableCell>
              </TableRow>
            ))}
            {staff.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No staff members found for this organization.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
