"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { createSupabaseServerClient, supabaseIsConfigured } from "@/lib/supabase/server";

const DEFAULT_PLAN_NAME = "Starter";

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `tenant-${Date.now()}`;
}

async function ensureDefaultPlatformPlan() {
  return prisma.platformPlan.upsert({
    where: { name: DEFAULT_PLAN_NAME },
    update: {
      price: 0,
      max_customers: 50,
      max_routers: 3,
    },
    create: {
      name: DEFAULT_PLAN_NAME,
      price: 0,
      max_customers: 50,
      max_routers: 3,
    },
  });
}

export async function signupAction(
  _prevState: { error: string },
  formData: FormData
): Promise<{ error: string }> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !organizationName || !email || !password) {
    return { error: "Please complete every field before creating your ISP account." };
  }

  if (password.length < 8) {
    return { error: "Choose a password with at least 8 characters." };
  }

  if (!supabaseIsConfigured()) {
    return { error: "Supabase Auth is not configured for onboarding." };
  }

  const normalizedSlug = normalizeSlug(organizationName);
  const existingOrganization = await prisma.organization.findUnique({
    where: { slug: normalizedSlug },
    select: { id: true },
  });

  if (existingOrganization) {
    return {
      error: "That business name is already in use. Try a different organization name.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: "ISP_ADMIN",
      },
    },
  });

  if (signUpError || !signUpData.user) {
    return { error: signUpError?.message ?? "Account creation failed." };
  }

  const defaultPlan = await ensureDefaultPlatformPlan();
  const organization = await prisma.organization.create({
    data: {
      name: organizationName,
      slug: normalizedSlug,
      status: "ACTIVE",
      plan_tier: "starter",
      platform_plan_id: defaultPlan.id,
      currency: "USD",
      timezone: "UTC",
    },
  });

  await prisma.user.create({
    data: {
      organization_id: organization.id,
      supabase_uid: signUpData.user.id,
      email,
      full_name: fullName,
      role: "ISP_ADMIN",
      is_active: true,
    },
  });

  const { error: sessionUpdateError } = await supabase.auth.updateUser({
    data: {
      role: "ISP_ADMIN",
      organization_id: organization.id,
      full_name: fullName,
    },
  });

  if (sessionUpdateError) {
    console.error("Failed to update auth metadata for new tenant admin:", sessionUpdateError.message);
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error("New tenant sign-in failed after account creation:", signInError.message);
  }

  redirect("/admin/dashboard");
}
