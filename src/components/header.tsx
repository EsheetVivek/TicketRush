import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Header() {
  const session = await auth();
  const signedIn = !!session?.user;
  const nav = [
    { href: "/events", label: "Events" },
    { href: "/#how-it-works", label: "How it works" },
    ...(signedIn ? [{ href: "/account/orders", label: "My orders" }] : []),
  ];
  return (
    <header className="border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-hot" />
            TicketRush
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {nav.map((n) => <Link key={n.href} href={n.href} className="btn-quiet px-3">{n.label}</Link>)}
          </nav>
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
      <nav aria-label="Main" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-1 sm:hidden">
        {nav.map((n) => <Link key={n.href} href={n.href} className="btn-quiet shrink-0 px-3">{n.label}</Link>)}
      </nav>
    </header>
  );
}
