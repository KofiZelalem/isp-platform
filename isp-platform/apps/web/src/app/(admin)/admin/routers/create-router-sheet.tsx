import Link from "next/link"
import { Plus } from "lucide-react"

export function CreateRouterSheet() {
  return (
    <Link
      href="/admin/routers/register"
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
    >
      <Plus className="h-4 w-4" />
      Register Router
    </Link>
  )
}
