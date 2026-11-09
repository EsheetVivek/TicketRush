import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, orders, seats, tickets } from "@/db/schema";
import { money, when } from "@/lib/format";
import { OrderStatusPoller } from "@/components/order-status";

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
  const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, session.user.id)));
  if (!order) notFound();
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId));
  const issued = await db.select({ id: tickets.id, qr: tickets.qrSig, section: seats.section, row: seats.row, number: seats.number })
    .from(tickets).innerJoin(seats, eq(seats.id, tickets.seatId)).where(eq(tickets.orderId, order.id));
  const qrs = await Promise.all(issued.map((t) => QRCode.toDataURL(t.qr, { margin: 1, width: 352, errorCorrectionLevel: "M" })));
  const copy = COPY[order.status] ?? COPY.pending;
  const done = ["ticketed", "refunded", "expired"].includes(order.status);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <OrderStatusPoller orderId={order.id} done={done} />
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Order {order.id.slice(0, 8)} · {money(order.amountCents)}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight" aria-live="polite">{copy.title}</h1>
      <p className="mt-2 text-lg text-muted">{copy.body}</p>
      <p className="mt-6 font-semibold">{event.title}</p>
      <p className="text-muted">{event.venue} · {when(event.startsAt)}</p>

      {issued.length > 0 && (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {issued.map((t, i) => (
            <li key={t.id} className="overflow-hidden rounded-2xl border border-line bg-card">
              <div className="p-5">
                <p className="font-mono text-xs uppercase tracking-widest text-muted">{t.section}</p>
                <p className="mt-1 text-2xl font-bold">Row {t.row} · Seat {t.number}</p>
              </div>
              <div aria-hidden className="mx-5 border-t-2 border-dashed border-line" />
              <div className="bg-white p-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise */}
                <img className="mx-auto w-44" src={qrs[i]} alt={`QR code for row ${t.row} seat ${t.number}`} width={176} height={176} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/" className="mt-10 inline-flex min-h-11 items-center rounded-full border border-line px-5 font-medium hover:bg-card">Back to events</Link>
    </main>
  );
}
