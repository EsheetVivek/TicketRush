import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Infinite ticker strip, adapted from Magic UI "marquee" (MIT). The content is rendered twice and
 * slid by its own width; the copy is hidden from screen readers. Pauses on hover; reduced motion
 * stops it (global rule in globals.css).
 */
export function Marquee({ children, className, duration = 40, gap = "2rem", reverse = false }: { children: ReactNode; className?: string; duration?: number; gap?: string; reverse?: boolean }) {
  const style = { "--duration": `${duration}s`, "--gap": gap, animationDirection: reverse ? "reverse" : undefined } as CSSProperties;
  return (
    <div className={cn("marquee flex overflow-hidden [gap:var(--gap)]", className)} style={style}>
      <div className="marquee-track flex shrink-0 items-center [gap:var(--gap)]" style={style}>{children}</div>
      <div aria-hidden className="marquee-track flex shrink-0 items-center [gap:var(--gap)]" style={style}>{children}</div>
    </div>
  );
}
