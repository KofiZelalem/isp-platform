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
import { getSupportTicketsForOrganization } from "@/lib/api/support"

import { UpdateTicketStatusForm } from "./update-ticket-status-form"

export const dynamic = "force-dynamic"

function priorityVariant(priority: string): "default" | "secondary" | "destructive" {
  if (priority === "URGENT" || priority === "HIGH") return "destructive"
  if (priority === "MEDIUM") return "default"
  return "secondary"
}

export default async function SupportPage() {
  const { organizationId } = await requireCurrentOrganization()
  const tickets = await getSupportTicketsForOrganization(organizationId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Support</h1>
        <p className="text-muted-foreground">Manage customer support tickets and helpdesk requests.</p>
      </div>

      <div className="overflow-hidden rounded-md border border-border/50 bg-background/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="hidden md:table-cell">Raised by</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{ticket.subject}</span>
                    <span className="text-xs text-muted-foreground">{ticket.category}</span>
                  </div>
                </TableCell>
                <TableCell>{ticket.subscriberName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={priorityVariant(ticket.priority)}>{ticket.priority.toLowerCase()}</Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {ticket.raisedByName}
                </TableCell>
                <TableCell className="text-right">
                  <UpdateTicketStatusForm ticketId={ticket.id} currentStatus={ticket.status} />
                </TableCell>
              </TableRow>
            ))}
            {tickets.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No support tickets yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
