import type { Metadata } from "next";
import { db } from "@/db";
import { listEvents } from "@/lib/events";
import { EventCard } from "@/components/event-card";

export const metadata: Metadata = { title: "Events" };
export const revalidate = 30;

export default async function Events() {
  const events = await listEvents(db);
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">On sale now</p>
      <h1 className="mt-2 text-4xl display sm:text-6xl">Events</h1>
      <p className="mt-2 max-w-xl text-muted">Pick your seats, hold them for 10 minutes, and pay. If anything fails on the way, you&apos;re refunded automatically.</p>
      {events.length ? (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {events.map((e) => <li key={e.id}><EventCard e={e} /></li>)}
        </ul>
      ) : (
        <p className="card mt-10 p-8 text-muted">No events are on sale right now. Check back soon.</p>
      )}
    </main>
  );
}
