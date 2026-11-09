import { describe, it, expect } from "vitest";
import { isSameOrigin, rateLimit } from "@/lib/http";

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
