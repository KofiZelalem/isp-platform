"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";

import { loginAction, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

const initialState: LoginState = null;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";

  return (
    <main className="login-shell relative flex min-h-screen items-center justify-center p-5 sm:p-8">
      <div className="absolute right-5 top-5 sm:right-8 sm:top-8">
        <ThemeToggle />
      </div>
      <Card className="login-card grid w-full max-w-4xl overflow-hidden rounded-[1.35rem] border-0 p-0 shadow-2xl shadow-slate-950/10 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="login-brand-panel flex min-h-56 flex-col justify-between p-8 text-white sm:p-11 lg:min-h-[520px]">
          <div>
            <div className="mb-14 flex items-center gap-2.5 text-lg font-semibold tracking-tight">
              <span className="login-mark" aria-hidden="true"><span /></span>
              <span>SPLYNX</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Admin portal</p>
            <h1 className="mt-4 max-w-xs text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Your network, clearly in view.
            </h1>
          </div>
          <div className="hidden items-center gap-4 lg:flex">
            <div className="login-shield" aria-hidden="true"><span /></div>
            <p className="max-w-44 text-sm leading-6 text-slate-300">A calm command center for your ISP operations.</p>
          </div>
        </aside>

        <section className="bg-card px-7 py-9 sm:px-14 sm:py-12">
          <CardHeader className="p-0">
            <CardTitle className="text-2xl tracking-tight sm:text-3xl">Administrator login</CardTitle>
            <CardDescription className="mt-2">Sign in to manage your ISP workspace.</CardDescription>
          </CardHeader>
          <CardContent className="mt-8 p-0">
            <form action={formAction} className="space-y-5">
              <input type="hidden" name="next" value={next} />
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>
              {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
              <Button type="submit" className="mt-2 h-11 w-full bg-blue-600 text-white hover:bg-blue-700" disabled={pending}>
                {pending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <p className="mt-7 text-center text-sm text-muted-foreground">
              New to SPLYNX?{" "}
              <Link href="/signup" className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-cyan-300">
                Create an account
              </Link>
            </p>
            <p className="mt-4 text-center text-sm">
              <Link className="text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/portal">
                Return to portal
              </Link>
            </p>
          </CardContent>
        </section>
      </Card>
    </main>
  );
}
