/**
 * Circuit breaker around the payment gateway (per server instance).
 * After `threshold` consecutive failures it opens for `cooldownMs`: checkout fails fast with a
 * clear message instead of piling thousands of slow requests onto a provider that is down.
 * After the cooldown one trial request is let through (half-open); success closes it.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  constructor(private threshold = 5, private cooldownMs = 20_000, private now = () => Date.now()) {}

  get state(): "closed" | "open" | "half_open" {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half_open" : "open";
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") throw new BreakerOpenError();
    try {
      const out = await fn();
      this.failures = 0;
      this.openedAt = null;
      return out;
    } catch (e) {
      this.failures++;
      if (this.state === "half_open" || this.failures >= this.threshold) this.openedAt = this.now();
      throw e;
    }
  }
}

export class BreakerOpenError extends Error {
  constructor() {
    super("Payment provider is temporarily unavailable.");
  }
}

export const paymentsBreaker = new CircuitBreaker();
