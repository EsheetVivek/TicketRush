import type { HistoryStatus } from "@/lib/history";

const TONE: Record<HistoryStatus, string> = {
  Ticketed: "bg-ok-soft text-ok",
  Refunded: "bg-sunk text-muted",
  "Refund pending": "bg-warn-soft text-warn",
  Expired: "bg-sunk text-muted",
  Pending: "bg-warn-soft text-warn",
};

export function StatusBadge({ status }: { status: HistoryStatus }) {
  return (
    <span className={`badge ${TONE[status]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{status}
    </span>
  );
}
