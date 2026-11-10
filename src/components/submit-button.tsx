"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Submit button that switches to a spinner and a "pending" label as soon as the form is sent. */
export function SubmitButton({ children, pendingLabel, className }: { children: ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cn("active:scale-[0.98] disabled:cursor-progress", className)}>
      {pending ? (<><span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />{pendingLabel}</>) : children}
    </button>
  );
}
