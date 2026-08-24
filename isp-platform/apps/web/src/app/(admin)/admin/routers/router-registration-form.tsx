"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createRouterAction, type CreateRouterState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" className="w-full sm:w-auto" disabled={pending}>{pending ? "Registering..." : "Register router"}</Button>;
}

function SetupCode({ title, children }: { title: string; children: string }) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
      <h2 className="font-semibold">{title}</h2>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs leading-5"><code>{children}</code></pre>
    </section>
  );
}

export function RouterRegistrationForm() {
  const [state, formAction] = useActionState<CreateRouterState, FormData>(createRouterAction, null);

  if (state && "success" in state) {
    if (state.connectionMode === "DIRECT_LAN") {
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
          <div><h1 className="text-2xl font-bold sm:text-3xl">Router registered</h1><p className="mt-1 text-sm text-muted-foreground">Local Ethernet test mode is active. No WireGuard setup is needed for this test.</p></div>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm"><p className="font-medium">Next: test the connection</p><p className="mt-1 text-muted-foreground">Return to Routers and press Check connection. Keep the Ethernet cable connected and the MikroTik API restricted to this laptop.</p></div>
          <Link href="/admin/routers" className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Back to routers</Link>
        </div>
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Router registered</h1>
          <p className="mt-1 text-sm text-muted-foreground">Complete both steps below before checking the router connection.</p>
        </div>
        <SetupCode title="1. Add this peer to the WireGuard server" children={state.serverPeerConfig ?? ""} />
        <SetupCode title="2. Paste this into the MikroTik terminal" children={state.routerScript ?? ""} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/admin/routers" className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Back to routers</Link>
          <Link href="/admin/routers/register" className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium">Register another router</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        <Link href="/admin/routers" className="text-sm text-primary underline underline-offset-4">Back to routers</Link>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Register MikroTik router</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter the router&apos;s current reachable API address. The next screen gives you the two WireGuard snippets to install.</p>
      </div>
      <form action={formAction} className="space-y-4 rounded-lg border border-border bg-background p-4 sm:p-6">
        <div className="space-y-2"><Label htmlFor="name">Router name</Label><Input id="name" name="name" placeholder="Main Hub" required /></div>
        <div className="space-y-2"><Label htmlFor="ipAddress">Router IP address or hostname</Label><Input id="ipAddress" name="ipAddress" placeholder="192.168.88.1" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="port">RouterOS API port</Label><Input id="port" name="port" type="number" min="1" max="65535" defaultValue="8728" required /></div>
          <div className="space-y-2"><Label htmlFor="location">Location</Label><Input id="location" name="location" placeholder="Main office" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="username">RouterOS username</Label><Input id="username" name="username" autoComplete="username" required /></div>
        <div className="space-y-2"><Label htmlFor="password">RouterOS password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required /></div>
        <div className="space-y-2"><Label htmlFor="hotspotLoginUrl">Hotspot login URL (optional)</Label><Input id="hotspotLoginUrl" name="hotspotLoginUrl" type="url" placeholder="http://192.168.88.1/login" /></div>
        {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <SubmitButton />
      </form>
    </div>
  );
}