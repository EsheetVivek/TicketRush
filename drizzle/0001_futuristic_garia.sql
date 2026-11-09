CREATE TABLE IF NOT EXISTS "seat_holds" (
	"seat_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"holder_id" text NOT NULL,
	"hold_token" uuid NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seat_holds" ADD CONSTRAINT "seat_holds_holder_id_users_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seat_holds_holder_id_event_id_index" ON "seat_holds" USING btree ("holder_id","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seat_holds_event_id_expires_at_index" ON "seat_holds" USING btree ("event_id","expires_at");