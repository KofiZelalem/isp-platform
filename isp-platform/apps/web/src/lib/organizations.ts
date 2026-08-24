import "server-only";

import { headers } from "next/headers";

import { prisma } from "@/lib/db";

export type PublicOrganizationContext = {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

function normalizeSlug(value: string | null | undefined): string | null {
  const slug = value?.trim().toLowerCase();
  return slug ? slug : null;
}

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;

  const host = value.trim().toLowerCase().split(":")[0];
  return host || null;
}

function isLocalHost(host: string | null): boolean {
  return host === null || host === "localhost" || host === "127.0.0.1";
}

function localDefaultOrganizationSlug(host: string | null): string | null {
  if (process.env.NODE_ENV === "production" || !isLocalHost(host)) return null;
  return normalizeSlug(process.env.PORTAL_DEFAULT_ORGANIZATION_SLUG);
}

function mapPublicOrganization(
  organization: {
    id: string;
    slug: string;
    name: string;
    custom_domain: string | null;
    primary_color: string | null;
    secondary_color: string | null;
  }
): PublicOrganizationContext {
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    customDomain: organization.custom_domain,
    primaryColor: organization.primary_color,
    secondaryColor: organization.secondary_color,
  };
}

async function findActiveOrganizationBySlug(
  slug: string
): Promise<PublicOrganizationContext | null> {
  const organization = await prisma.organization.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      deleted_at: null,
      NOT: { slug: "isp-os-platform" },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      custom_domain: true,
      primary_color: true,
      secondary_color: true,
    },
  });

  return organization ? mapPublicOrganization(organization) : null;
}

async function findActiveOrganizationByCustomDomain(
  host: string
): Promise<PublicOrganizationContext | null> {
  const organization = await prisma.organization.findFirst({
    where: {
      custom_domain: host,
      status: "ACTIVE",
      deleted_at: null,
      NOT: { slug: "isp-os-platform" },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      custom_domain: true,
      primary_color: true,
      secondary_color: true,
    },
  });

  return organization ? mapPublicOrganization(organization) : null;
}

export async function resolvePublicOrganization(
  slug: string | null | undefined,
  host?: string | null
): Promise<PublicOrganizationContext | null> {
  const normalizedSlug = normalizeSlug(slug);
  const normalizedHost = normalizeHost(host);
  const requestedSlug = normalizedSlug ?? localDefaultOrganizationSlug(normalizedHost);

  const [organizationBySlug, organizationByHost] = await Promise.all([
    requestedSlug ? findActiveOrganizationBySlug(requestedSlug) : Promise.resolve(null),
    !isLocalHost(normalizedHost)
      ? findActiveOrganizationByCustomDomain(normalizedHost as string)
      : Promise.resolve(null),
  ]);

  if (
    organizationBySlug &&
    organizationByHost &&
    organizationBySlug.id !== organizationByHost.id
  ) {
    return null;
  }

  return organizationByHost ?? organizationBySlug;
}

export async function resolvePublicOrganizationFromRequest(
  slug: string | null | undefined
): Promise<PublicOrganizationContext | null> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  return resolvePublicOrganization(slug, host);
}