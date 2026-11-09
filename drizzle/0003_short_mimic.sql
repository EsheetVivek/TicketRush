CREATE TABLE "queue_entries" (
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" bigserial NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "queue_entries_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "queue_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "queue_rate_per_min" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "queue_burst" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queue_entries_event_id_position_index" ON "queue_entries" USING btree ("event_id","position");