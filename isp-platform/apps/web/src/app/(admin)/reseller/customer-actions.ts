"use server";

import bcrypt from "bcryptjs";
import { assignPlanToSubscriber, activateSubscription } from "billing";
import { createTenantClient } from "database";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type ResellerCustomerActionState = { error: string } | { success: true } | null;

function fields(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new Error("Username must be 3-64 characters using letters, numbers, dots, underscores, or hyphens.");
  if (!fullName || fullName.length > 120) throw new Error("Full name is required.");
  if (email && (!email.includes("@") || email.length > 254)) throw new Error("Enter a valid email address.");
  return { username, full_name: fullName, email: email || null, phone: phone || null };
}

async function resellerContext() {
  const context = await requireRole("RESELLER");
  const tenantDb = createTenantClient(prisma, context.organizationId);
  const profile = await tenantDb.resellerProfile.findUnique({ where: { user_id: context.userId }, select: { id: true } });
  if (!profile) throw new Error("Reseller profile is not configured.");
  return { ...context, tenantDb, profileId: profile.id };
}

export async function createResellerCustomerAction(_previousState: ResellerCustomerActionState, formData: FormData): Promise<ResellerCustomerActionState> {
  try {
    const context = await resellerContext();
    const data = fields(formData);
    const password = String(formData.get("password") ?? "");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const planId = String(formData.get("planId") ?? "").trim();
    const subscriber = await context.tenantDb.subscriber.create({ data: { ...data, organization_id: context.organizationId, reseller_id: context.profileId, password_hash: await bcrypt.hash(password, 10) }, select: { id: true } });
    if (planId) {
      const subscription = await assignPlanToSubscriber(context.tenantDb, { subscriberId: subscriber.id, planId });
      await activateSubscription(context.tenantDb, subscription.id);
    }
    revalidatePath("/reseller");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Customer could not be created." };
  }
}

export async function updateResellerCustomerAction(_previousState: ResellerCustomerActionState, formData: FormData): Promise<ResellerCustomerActionState> {
  try {
    const context = await resellerContext();
    const subscriberId = String(formData.get("subscriberId") ?? "").trim();
    const customer = await context.tenantDb.subscriber.findFirst({ where: { id: subscriberId, reseller_id: context.profileId }, select: { id: true } });
    if (!customer) throw new Error("Customer is not assigned to your reseller account.");
    await context.tenantDb.subscriber.update({ where: { id: customer.id }, data: fields(formData) });
    revalidatePath("/reseller");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Customer could not be updated." };
  }
}
