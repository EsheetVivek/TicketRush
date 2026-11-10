import Link from "next/link";
import { auth, signOut } from "@/auth";
import { NavPill } from "@/components/watermelon/nav-pill";

export async function Header() {
  const session = await auth();
  const signedIn = !!session?.user;
  const nav = [
    { href: "/events", label: "Events" },
    { href: "/how-it-works", label: "How it works" },
    ...(signedIn ? [{ href: "/account/orders", label: "My orders" }] : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur-md supports-[backdrop-filter]:bg-paper/65">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-hot" />
            TicketRush
          </Link>
          <NavPill items={nav} className="hidden sm:flex" />
        </div>
        {signedIn ? (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }} className="flex items-center gap-3 text-sm">
            <span className="hidden max-w-48 truncate text-muted lg:inline">{session.user?.name ?? session.user?.email}</span>
            <button type="submit" className="btn-secondary">Sign out</button>
          </form>
        ) : (
          <Link href="/signin" className="btn-secondary">Sign in</Link>
        )}
      </div>
      <div className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 sm:hidden">
        <NavPill items={nav} className="w-max" />
      </div>
    </header>
  );
}
