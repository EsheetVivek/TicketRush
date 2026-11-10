import { describe, it, expect } from "vitest";
import { Timing, isSameOrigin, rateLimit } from "@/lib/http";

const req = (h: Record<string, string>) => new Request("https://ticketrush.example/api/holds", { method: "POST", headers: h });

describe("origin check", () => {
  it("allows same-origin requests", () => expect(isSameOrigin(req({ origin: "https://ticketrush.example", host: "ticketrush.example" }))).toBe(true));
  it("blocks other origins and missing origin", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "ticketrush.example" }))).toBe(false);
    expect(isSameOrigin(req({ host: "ticketrush.example" }))).toBe(false);
  });
});

describe("rate limit", () => {
  it("allows up to the limit, then blocks until the window passes", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t + i).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, t + 5).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, t + 1500).ok).toBe(true);
  });
});

describe("Server-Timing", () => {
  it("reports db time, named parts and a total", async () => {
    const t = new Timing();
    await t.db(new Promise((r) => setTimeout(r, 15)), "auth");
    t.add("gateway", 5);
    const h = t.header();
    expect(h).toMatch(/^db;dur=\d+\.\d, auth;dur=\d+\.\d, gateway;dur=5\.0, total;dur=\d+\.\d$/);
    expect(Number(h.match(/total;dur=([\d.]+)/)![1])).toBeGreaterThanOrEqual(Number(h.match(/db;dur=([\d.]+)/)![1]));
    expect(t.headers({ "Retry-After": "5" })).toMatchObject({ "Retry-After": "5", "Server-Timing": expect.any(String) });
  });
});
