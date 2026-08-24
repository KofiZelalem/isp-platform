"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient, supabaseIsConfigured } from "@/lib/supabase/server";

export type LoginState = { error: string } | null;

function safeNextPath(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email address and password." };
  if (!supabaseIsConfigured()) return { error: "Supabase Auth is not configured for this environment." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(safeNextPath(formData.get("next")));
}