import { describe, it, expect, beforeAll } from "vitest";
import { encryptField, decryptField, signTicket, verifyTicket } from "@/lib/crypto";

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.TICKET_SIGNING_SECRET = "test-secret";
});

describe("field encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptField("+91 80768 56412");
    const b = encryptField("+91 80768 56412");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("+91 80768 56412");
  });
  it("rejects tampered ciphertext", () => {
    const t = encryptField("secret").split(".");
    t[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptField(t.join("."))).toThrow();
  });
});

describe("ticket signatures", () => {
  it("verifies a genuine ticket", () => {
    expect(verifyTicket(signTicket("abc-123"))).toBe("abc-123");
  });
  it("rejects a forged or altered ticket", () => {
    const s = signTicket("abc-123");
    expect(verifyTicket(s.replace("abc-123", "abc-124"))).toBeNull();
    expect(verifyTicket("abc-123.forged")).toBeNull();
  });
});
