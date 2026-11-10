import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { events, orderItems, orders, seats, tickets } from "@/db/schema";

type DB = PostgresJsDatabase<typeof schema>;

export const HISTORY_PAGE_SIZE = 20;

export type HistoryStatus = "Ticketed" | "Refunded" | "Refund pending" | "Expired" | "Pending";
export const STATUS_LABEL: Record<string, HistoryStatus> = {
  ticketed: "Ticketed", refunded: "Refunded", refund_pending: "Refund pending", expired: "Expired", pending: "Pending", paid: "Pending",
};

export interface HistoryRow {
  id: string; createdAt: Date; eventId: string; eventTitle: string; status: HistoryStatus; amountCents: number;
  gatewayRef: string | null; seats: { section: string; row: string; number: number }[];
}
export interface HistoryStats { orders: number; spentCents: number; ticketsHeld: number; refunds: number; refundedCents: number }

const utc = (v: string | Date) => (v instanceof Date ? v : new Date(`${String(v).replace(" ", "T")}Z`));

/**
 * The signed-in buyer's own orders, newest first. `userId` must come from the server-side session,
 * never from the request: it is the only filter, so it is what keeps other people's orders out.
 */
export async function getOrderHistory(db: DB, userId: string, page = 1): Promise<{ rows: HistoryRow[]; stats: HistoryStats; page: number; pages: number }> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const [statsRows, list] = await Promise.all([
    db.execute<{ orders: number; spent: number; tickets: number; refunds: number; refunded: number }>(sql`
      select count(*)::int as orders,
        coalesce(sum(amount_cents) filter (where status = 'ticketed'), 0)::int as spent,
        count(*) filter (where status in ('refunded', 'refund_pending'))::int as refunds,
        coalesce(sum(amount_cents) filter (where status = 'refunded'), 0)::int as refunded,
        (select count(*)::int from ${tickets} t join ${orders} o2 on o2.id = t.order_id
          where o2.user_id = ${userId} and o2.status = 'ticketed') as tickets
      from ${orders} where user_id = ${userId}`),
    db.execute<{ id: string; created_at: string; event_id: string; title: string; status: string; amount_cents: number; gateway_ref: string | null; seats: { section: string; row: string; number: number }[] | null }>(sql`
      select o.id, o.created_at, o.event_id, e.title, o.status, o.amount_cents, o.gateway_ref,
        (select json_agg(json_build_object('section', s.section, 'row', s.row, 'number', s.number) order by s.price_cents desc, s.row, s.number)
          from ${orderItems} oi join ${seats} s on s.id = oi.seat_id where oi.order_id = o.id) as seats
      from ${orders} o join ${events} e on e.id = o.event_id
      where o.user_id = ${userId}
      order by o.created_at desc, o.id desc
      limit ${HISTORY_PAGE_SIZE} offset ${(safePage - 1) * HISTORY_PAGE_SIZE}`),
  ]);
  const s = statsRows[0];
  return {
    page: safePage,
    pages: Math.max(1, Math.ceil(s.orders / HISTORY_PAGE_SIZE)),
    stats: { orders: s.orders, spentCents: s.spent, ticketsHeld: s.tickets, refunds: s.refunds, refundedCents: s.refunded },
    rows: list.map((r) => ({
      id: r.id, createdAt: utc(r.created_at), eventId: r.event_id, eventTitle: r.title, status: STATUS_LABEL[r.status] ?? "Pending",
      amountCents: r.amount_cents, gatewayRef: r.gateway_ref, seats: r.seats ?? [],
    })),
  };
}

/** "Gold · F12, F13" (several sections are joined with " / "). */
export function formatSeats(list: { section: string; row: string; number: number }[]): string {
  const by = new Map<string, string[]>();
  for (const s of list) by.set(s.section, [...(by.get(s.section) ?? []), `${s.row}${s.number}`]);
  return [...by.entries()].map(([sec, xs]) => `${sec} · ${xs.join(", ")}`).join(" / ") || "—";
}

/** "mock_pi_6f1c…a9c2": enough to recognise a payment, full value is copied. */
export function shortRef(ref: string): string {
  return ref.length <= 16 ? ref : `${ref.slice(0, 10)}…${ref.slice(-4)}`;
}
