import { PendingLink } from "@/components/pending-link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { events } from "@/db/schema";
import { when } from "@/lib/format";
import { EventGate } from "@/components/waiting-room";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();
  const session = await auth();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <PendingLink href="/events" className="btn-quiet -ml-3 mb-4 px-3">← All events</PendingLink>
      <p className="eyebrow">{when(event.startsAt)}</p>
      <h1 className="mt-2 text-4xl display text-balance sm:text-6xl">{event.title}</h1>
      <p className="mt-2 text-muted">{event.venue}</p>
      <EventGate eventId={event.id} signedIn={!!session?.user} queueEnabled={event.queueEnabled} />
    </main>
  );
}
