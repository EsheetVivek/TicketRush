import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export async function Header() {
  const session = await auth();
  return (
    <header className="border-b border-line bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span aria-hidden className="inline-block h-3 w-3 rotate-45 rounded-[2px] bg-hot" />
          TicketRush
        </Link>
        {session?.user ? (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }} className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{session.user.name ?? session.user.email}</span>
            <button type="submit" className="min-h-11 rounded-full border border-line px-4 font-medium hover:bg-paper">Sign out</button>
          </form>
        ) : (
          <form action={async () => { "use server"; await signIn("github"); }}>
            <button type="submit" className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:opacity-90">Sign in with GitHub</button>
          </form>
        )}
      </div>
    </header>
  );
}
