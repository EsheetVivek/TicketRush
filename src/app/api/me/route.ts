import { auth } from "@/auth";
import { isOrganizer } from "@/lib/organizer";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, for the header. Fetched by the browser after the page shows, so public pages
 * can be served from the CDN instead of rendering per request. Returns only a display name.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  return Response.json(
    { signedIn: !!user, name: user ? (user.name ?? user.email ?? null) : null, organizer: isOrganizer(session) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
