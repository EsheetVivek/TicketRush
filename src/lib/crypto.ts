import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

/** Field-level encryption for PII (AES-256-GCM). Format: v1.<keyId>.<iv>.<tag>.<ciphertext> (base64url). */
function key(): { id: string; bytes: Buffer } {
  const raw = process.env.FIELD_ENCRYPTION_KEY; // 32 bytes, base64
  const id = process.env.FIELD_ENCRYPTION_KEY_ID ?? "k1";
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes (base64)");
  return { id, bytes };
}

export function encryptField(plain: string): string {
  const { id, bytes } = key();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", bytes, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", id, iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(token: string): string {
  const [v, , iv, tag, ct] = token.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const { bytes } = key();
  const d = createDecipheriv("aes-256-gcm", bytes, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** Signed QR payload for tickets: <ticketId>.<hmac>. */
export function signTicket(ticketId: string): string {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret) throw new Error("TICKET_SIGNING_SECRET is not set");
  return `${ticketId}.${createHmac("sha256", secret).update(ticketId).digest("base64url")}`;
}

export function verifyTicket(payload: string): string | null {
  const i = payload.lastIndexOf(".");
  if (i < 1) return null;
  const id = payload.slice(0, i);
  const expected = Buffer.from(signTicket(id));
  const given = Buffer.from(payload);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}
