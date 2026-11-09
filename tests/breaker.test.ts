import { describe, it, expect } from "vitest";
import { CircuitBreaker, BreakerOpenError } from "@/lib/payments/breaker";

describe("circuit breaker", () => {
  it("opens after repeated failures, fails fast, then recovers through half-open", async () => {
    let t = 0;
    const b = new CircuitBreaker(3, 1000, () => t);
    const fail = () => Promise.reject(new Error("down"));
    for (let i = 0; i < 3; i++) await expect(b.run(fail)).rejects.toThrow("down");
    expect(b.state).toBe("open");
    let called = false;
    await expect(b.run(async () => { called = true; })).rejects.toBeInstanceOf(BreakerOpenError);
    expect(called).toBe(false); // fails fast without touching the gateway
    t = 1000;
    expect(b.state).toBe("half_open");
    await expect(b.run(async () => "ok")).resolves.toBe("ok");
    expect(b.state).toBe("closed");
  });

  it("re-opens immediately if the half-open trial fails", async () => {
    let t = 0;
    const b = new CircuitBreaker(1, 1000, () => t);
    await expect(b.run(() => Promise.reject(new Error("x")))).rejects.toThrow();
    t = 1000;
    await expect(b.run(() => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(b.state).toBe("open");
  });
});
