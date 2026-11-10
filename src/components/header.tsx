import Link from "next/link";
import { AccountButton, HeaderNav } from "@/components/account-menu";

/** Static shell: no session lookup on the server, so pages using it can be cached. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/90 backdrop-blur-md supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="display flex min-h-11 items-center gap-2 text-2xl">
            <span aria-hidden className="inline-block size-3.5 rotate-45 border-2 border-ink bg-hot" />
            TicketRush
          </Link>
          <HeaderNav />
        </div>
        <AccountButton />
      </div>
      <div className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 sm:hidden">
        <HeaderNav mobile />
      </div>
    </header>
  );
}
