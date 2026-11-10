"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NavPill } from "@/components/watermelon/nav-pill";
import { PendingLink } from "@/components/pending-link";
import { SubmitButton } from "@/components/submit-button";
import { signOutAction } from "@/app/actions/auth";

type Me = { signedIn: boolean; name: string | null } | null;

/**
 * The signed-in parts of the header, loaded in the browser. Keeping the session lookup out of the
 * server render lets the landing and events pages be cached at the edge and appear instantly.
 */
function useMe(): Me {
  const [me, setMe] = useState<Me>(null);
  const pathname = usePathname();
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((d) => live && setMe(d)).catch(() => live && setMe({ signedIn: false, name: null }));
    return () => { live = false; };
  }, [pathname]);
  return me;
}

export function HeaderNav({ mobile = false }: { mobile?: boolean }) {
  const me = useMe();
  const nav = [
    { href: "/events", label: "Events" },
    { href: "/how-it-works", label: "How it works" },
    ...(me?.signedIn ? [{ href: "/account/orders", label: "My orders" }] : []),
  ];
  return <NavPill items={nav} className={mobile ? "w-max" : "hidden sm:flex"} />;
}

export function AccountButton() {
  const me = useMe();
  if (me === null) return <span aria-hidden className="h-10 w-24 animate-pulse rounded-full bg-sunk" />;
  if (!me.signedIn) return <PendingLink href="/signin" className="btn-secondary">Sign in</PendingLink>;
  return (
    <form action={signOutAction} className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-48 truncate text-muted lg:inline">{me.name}</span>
      <SubmitButton pendingLabel="Signing out" className="btn-secondary">Sign out</SubmitButton>
    </form>
  );
}
