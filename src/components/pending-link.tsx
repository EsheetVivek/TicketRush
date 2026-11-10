"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Spinner that appears inside a Link while its navigation is in flight (Next's useLinkStatus). */
export function LinkSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-hidden className={cn("inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent transition-opacity",
      pending ? "animate-spin opacity-100" : "w-0 border-0 opacity-0", className)} />
  );
}

/** A Link that shows instant feedback (spinner + pressed state) the moment it's clicked. */
export function PendingLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={cn("active:scale-[0.97]", className)}>
      {children}
      <LinkSpinner />
    </Link>
  );
}
