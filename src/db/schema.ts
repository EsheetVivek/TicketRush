import {
  pgTable, text, timestamp, integer, uuid, primaryKey, unique, jsonb, index, pgEnum,
} from "drizzle-orm/pg-core";

/* ---------- Auth.js tables (database sessions) ---------- */
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  phoneEnc: text("phone_enc"), // AES-256-GCM, see src/lib/crypto.ts
  role: text("role").notNull().default("buyer"), // buyer | organizer
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

/* ---------- Ticketing ---------- */
export const orderStatus = pgEnum("order_status", [
  "pending", "paid", "ticketed", "expired", "refund_pending", "refunded",
]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  venue: text("venue").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  onSaleAt: timestamp("on_sale_at").notNull(),
  status: text("status").notNull().default("draft"), // draft | on_sale | sold_out | cancelled
});

export const seats = pgTable("seats", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id),
  section: text("section").notNull(),
  row: text("row").notNull(),
  number: integer("number").notNull(),
  priceCents: integer("price_cents").notNull(),
}, (t) => [unique().on(t.eventId, t.section, t.row, t.number), index().on(t.eventId)]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id),
  eventId: uuid("event_id").notNull().references(() => events.id),
  status: orderStatus("status").notNull().default("pending"),
  amountCents: integer("amount_cents").notNull(),
  idemKey: text("idem_key").notNull().unique(),
  gatewayRef: text("gateway_ref").unique(), // Stripe PaymentIntent / Razorpay order id
  holdExpiresAt: timestamp("hold_expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index().on(t.userId), index().on(t.status, t.createdAt)]);

export const orderItems = pgTable("order_items", {
  orderId: uuid("order_id").notNull().references(() => orders.id),
  seatId: uuid("seat_id").notNull().references(() => seats.id),
}, (t) => [primaryKey({ columns: [t.orderId, t.seatId] })]);

/** UNIQUE(event_id, seat_id) is the final guarantee that a seat is never sold twice. */
export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  eventId: uuid("event_id").notNull().references(() => events.id),
  seatId: uuid("seat_id").notNull().references(() => seats.id),
  qrSig: text("qr_sig").notNull(),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  usedAt: timestamp("used_at"),
}, (t) => [unique("tickets_event_seat_uq").on(t.eventId, t.seatId)]);

/** Webhook dedupe: a gateway event is processed at most once. */
export const paymentEvents = pgTable("payment_events", {
  gatewayEventId: text("gateway_event_id").primaryKey(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id).unique(),
  gatewayRefundId: text("gateway_refund_id").unique(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  target: text("target").notNull(),
  ipHash: text("ip_hash"),
  meta: jsonb("meta"),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [index().on(t.target, t.at)]);

/**
 * Seat holds (Postgres implementation). seat_id is the primary key, so a seat can have at most
 * one hold row; a multi-seat hold is inserted in one transaction and is all-or-nothing.
 * A Redis implementation can replace this for lower latency; Postgres stays the source of truth.
 */
export const seatHolds = pgTable("seat_holds", {
  seatId: uuid("seat_id").primaryKey().references(() => seats.id),
  eventId: uuid("event_id").notNull().references(() => events.id),
  holderId: text("holder_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  holdToken: uuid("hold_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => [index().on(t.holderId, t.eventId), index().on(t.eventId, t.expiresAt)]);

/**
 * Backing store for the mock gateway (tests, load tests and the demo when no Stripe keys are set).
 * Lives in Postgres so it behaves consistently across serverless instances.
 */
export const mockPayments = pgTable("mock_payments", {
  ref: text("ref").primaryKey(),
  idemKey: text("idem_key").notNull().unique(),
  orderId: text("order_id").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  status: text("status").notNull().default("requires_payment"),
  refundIdemKey: text("refund_idem_key").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
