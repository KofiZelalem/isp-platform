import { redirect } from "next/navigation"

// Canonical resellers management lives at the plural route; keep this alias for direct links.
export default function ResellerSingularRedirectPage() {
  redirect("/admin/resellers")
}
