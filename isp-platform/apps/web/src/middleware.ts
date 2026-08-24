import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedPath = pathname.startsWith("/admin") || pathname.startsWith("/platform") || pathname.startsWith("/reseller");
  if (!protectedPath) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return loginRedirect(request);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return loginRedirect(request);

  const role = data.user.app_metadata?.role ?? data.user.user_metadata?.role;
  const hasOrganization = Boolean(
    data.user.app_metadata?.organization_id ?? data.user.user_metadata?.organization_id
  );

  // Platform pages enforce PLATFORM_ADMIN from the application database. This
  // avoids blocking a freshly promoted account whose Supabase session still
  // carries signup-era metadata.
  if (pathname.startsWith("/reseller") && role !== "RESELLER") return loginRedirect(request);
  if (pathname.startsWith("/admin") && !hasOrganization && role !== "PLATFORM_ADMIN") return loginRedirect(request);

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/platform/:path*", "/reseller/:path*"],
};
