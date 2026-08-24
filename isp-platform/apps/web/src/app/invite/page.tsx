import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteAcceptanceForm } from "./invite-acceptance-form";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-lg"><CardHeader><CardTitle>Join ISP-OS</CardTitle><CardDescription>Complete your account setup using the invitation you received.</CardDescription></CardHeader><CardContent><InviteAcceptanceForm token={token ?? ""} /></CardContent></Card></main>;
}
