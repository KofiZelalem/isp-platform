import { redirect } from "next/navigation";

import { buildPortalForwardUrl } from "../lib/forward";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export default async function CaptivePortalPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  redirect(buildPortalForwardUrl(await searchParams));
}
