CREATE TABLE "mock_payments" (
	"ref" text PRIMARY KEY NOT NULL,
	"idem_key" text NOT NULL,
	"order_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"status" text DEFAULT 'requires_payment' NOT NULL,
	"refund_idem_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mock_payments_idem_key_unique" UNIQUE("idem_key"),
	CONSTRAINT "mock_payments_refund_idem_key_unique" UNIQUE("refund_idem_key")
);
