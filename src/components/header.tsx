import Link from "next/link";
import { AccountButton, HeaderNav } from "@/components/account-menu";

/** Static shell: no session lookup on the server, so pages using it can be cached. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur-md supports-[backdrop-filter]:bg-paper/65">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-hot" />
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
