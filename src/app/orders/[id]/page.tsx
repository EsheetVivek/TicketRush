import { notFound, redirect } from "next/navigation";
import { PendingLink } from "@/components/pending-link";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, orders, seats, tickets } from "@/db/schema";
import { money, when } from "@/lib/format";
import { OrderStatusPoller } from "@/components/order-status";
import { CheckoutSteps } from "@/components/watermelon/checkout-steps";
import { TicketStub } from "@/components/poster/ticket-stub";

export const dynamic = "force-dynamic";

const COPY: Record<string, { title: string; body: string }> = {
  pending: { title: "Confirming your payment…", body: "This usually takes a few seconds. You can keep this page open." },
  paid: { title: "Payment received, issuing tickets…", body: "Almost there." },
  ticketed: { title: "You're in.", body: "Show these QR codes at the entrance. Each one works once." },
  refund_pending: { title: "Refund on its way", body: "We couldn't issue these tickets, so your payment is being refunded automatically." },
  refunded: { title: "Refunded", body: "We couldn't issue these tickets, so your payment has been refunded in full." },
  expired: { title: "Checkout expired", body: "No payment was taken. Pick your seats again to try once more." },
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/signin?callbackUrl=/orders/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  // Ownership check in the query itself: another user's order looks exactly like a missing one.
  // Order, event and tickets are fetched in parallel (the tickets query carries the same ownership filter).
  const [[row], issued] = await Promise.all([
    db.select({ order: orders, event: events }).from(orders).innerJoin(events, eq(events.id, orders.eventId))
      .where(and(eq(orders.id, id), eq(orders.userId, session.user.id))),
    db.select({ id: tickets.id, qr: tickets.qrSig, section: seats.section, row: seats.row, number: seats.number })
      .from(tickets).innerJoin(seats, eq(seats.id, tickets.seatId)).innerJoin(orders, eq(orders.id, tickets.orderId))
      .where(and(eq(tickets.orderId, id), eq(orders.userId, session.user.id))),
  ]);
  if (!row) notFound();
  const { order, event } = row;
  const qrs = await Promise.all(issued.map((t) => QRCode.toDataURL(t.qr, { margin: 1, width: 352, errorCorrectionLevel: "M" })));
  const copy = COPY[order.status] ?? COPY.pending;
  const done = ["ticketed", "refunded", "expired"].includes(order.status);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <OrderStatusPoller orderId={order.id} done={done} />
      {order.status !== "expired" && <CheckoutSteps current={order.status === "ticketed" ? "tickets" : "pay"} className="mb-10 max-w-md" />}
      <p className="eyebrow">Order {order.id.slice(0, 8)} · {money(order.amountCents)}</p>
      <h1 className="mt-2 text-4xl display sm:text-6xl" aria-live="polite">{copy.title}</h1>
      <p className="mt-2 text-muted">{copy.body}</p>
      <div className="card mt-8 p-6">
        <p className="font-semibold">{event.title}</p>
        <p className="mt-1 text-sm text-muted">{event.venue} · {when(event.startsAt)}</p>
      </div>

      {issued.length > 0 && (
        <ul className="mt-8 grid gap-8 sm:grid-cols-2">
          {issued.map((t, i) => <TicketStub key={t.id} index={i} section={t.section} row={t.row} number={t.number} qr={qrs[i]} />)}
        </ul>
      )}
      <div className="mt-10 flex flex-wrap gap-3">
        <PendingLink href="/account/orders" className="btn-secondary">My orders</PendingLink>
        <PendingLink href="/events" className="btn-quiet">Back to events</PendingLink>
      </div>
    </main>
  );
}
