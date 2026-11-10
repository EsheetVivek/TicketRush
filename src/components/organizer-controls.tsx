"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Rocket } from "lucide-react";

/** Re-fetches the dashboard every few seconds while the tab is visible. */
export function AutoRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(true);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, everyMs);
    return () => clearInterval(t);
  }, [live, everyMs, router]);
  return (
    <button type="button" onClick={() => setLive((v) => !v)} aria-pressed={live} className="btn-secondary">
      <RefreshCw aria-hidden className={`size-4 ${live ? "animate-spin [animation-duration:3s]" : ""}`} />{live ? "Live · every 5 s" : "Paused"}
    </button>
  );
}

export function StartDropButton({ eventId, title }: { eventId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const go = () => {
    if (!confirm(`Start a new drop for "${title}"? The sale reopens now and the waiting room starts empty. Sold tickets are kept.`)) return;
    start(async () => {
      const r = await fetch("/api/organizer/drop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId }) });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? `Drop started. ${d.queueCleared} queue entries cleared.` : d.error ?? "Couldn't start the drop.");
      router.refresh();
    });
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={go} disabled={pending} className="btn-primary"><Rocket aria-hidden className="size-4" />{pending ? "Starting…" : "Start a drop"}</button>
      <p role="status" className="text-xs text-muted">{msg}</p>
    </div>
  );
}
