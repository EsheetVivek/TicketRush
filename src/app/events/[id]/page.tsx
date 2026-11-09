import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { events } from "@/db/schema";
import { when } from "@/lib/format";
import { SeatPicker } from "@/components/seat-picker";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) notFound();
  const session = await auth();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{when(event.startsAt)}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-balance sm:text-5xl">{event.title}</h1>
      <p className="mt-2 text-lg text-muted">{event.venue}</p>
      <SeatPicker eventId={event.id} signedIn={!!session?.user} />
    </main>
  );
}
