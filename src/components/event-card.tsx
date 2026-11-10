import type { EventCard as E } from "@/lib/events";
import { EventPosterCard } from "@/components/watermelon/event-poster-card";

/** Server wrapper: serialises the event for the client-side expandable poster card. */
export function EventCard({ e }: { e: E }) {
  return <EventPosterCard e={{ id: e.id, title: e.title, venue: e.venue, startsAt: e.startsAt.toISOString(), total: e.total, sold: e.sold, fromCents: e.fromCents, queue: e.queue }} />;
}
