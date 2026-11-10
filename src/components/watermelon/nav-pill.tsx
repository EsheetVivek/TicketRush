"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface NavItem { href: string; label: string }

/** Adapted from Watermelon UI "continuous-tabs": a tactile pill with a sliding active indicator. */
export function NavPill({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href.split("#")[0]) && !href.includes("#"));

  return (
    <LayoutGroup id="main-nav">
      <nav aria-label="Main" className={cn("pill-surface relative flex items-center gap-0.5 rounded-full p-1", className)}>
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className="relative flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium outline-none">
              {active && (
                <motion.span layoutId="nav-active" aria-hidden
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
                  className="absolute inset-0 rounded-full bg-ink shadow-xs" />
              )}
              <span className={cn("relative z-10 transition-colors duration-200", active ? "text-paper" : "text-muted hover:text-ink")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
