import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Round sticker with text running around its edge, slowly spinning (inspired by React Bits "circular text", MIT). */
export function SpinSticker({ text, center, className }: { text: string; center: ReactNode; className?: string }) {
  const chars = [...text];
  return (
    <div className={cn("relative grid size-32 place-items-center rounded-full border-2 border-ink bg-acid text-acid-ink shadow-[3px_3px_0_var(--ink)]", className)}>
      <div aria-hidden className="absolute inset-0 animate-[spin-slow_18s_linear_infinite] motion-reduce:animate-none">
        {chars.map((c, i) => (
          <span key={i} className="absolute left-1/2 top-0 h-1/2 origin-bottom pt-1.5 font-mono text-[10px] font-bold uppercase"
            style={{ transform: `translateX(-50%) rotate(${(360 / chars.length) * i}deg)` }}>{c}</span>
        ))}
      </div>
      <span className="sr-only">{text}</span>
      <div className="relative text-center">{center}</div>
    </div>
  );
}
