"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { money } from "@/lib/format";

interface Checkout { orderId: string; clientSecret: string | null; amountMinor: number; gateway: "stripe" | "razorpay" | "mock" }

/** One idempotency key per hold: double clicks and retries reuse the same order and payment. */
export function PayPanel({ eventId, holdToken }: { eventId: string; holdToken: string }) {
  const idemKey = useMemo(() => {
    try {
      const k = `tr:idem:${holdToken}`;
      const existing = sessionStorage.getItem(k);
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      sessionStorage.setItem(k, fresh);
      return fresh;
    } catch {
      return crypto.randomUUID();
    }
  }, [holdToken]);
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [pk, setPk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payments-config").then((r) => r.json()).then((c) => setPk(c.publishableKey)).catch(() => {});
  }, []);

  const stripePromise = useMemo(() => (pk ? loadStripe(pk) : null), [pk]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, idemKey }) });
      const b = await r.json();
      if (!r.ok) setError(b.error ?? "Checkout failed. Try again.");
      else setCheckout(b);
    } catch {
      setError("Network problem. Your seats are still held, so try again.");
    } finally {
      setBusy(false);
    }
  }

  async function mockPay() {
    if (!checkout) return;
    setBusy(true);
    const r = await fetch("/api/mock-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: checkout.orderId }) });
    if (r.ok) router.push(`/orders/${checkout.orderId}`);
    else { setError("Test payment failed. Try again."); setBusy(false); }
  }

  if (!checkout) {
    return (
      <>
        <button type="button" onClick={start} disabled={busy} className="mt-4 min-h-11 w-full rounded-full bg-hot font-semibold text-hot-ink hover:opacity-90 disabled:opacity-50">
          {busy ? "Starting checkout…" : "Continue to payment"}
        </button>
        {error && <p role="alert" className="mt-3 rounded-lg bg-hot/10 px-3 py-2 text-sm text-hot">{error}</p>}
      </>
    );
  }

  if (checkout.gateway === "stripe" && checkout.clientSecret && stripePromise) {
    return (
      <div className="mt-4">
        <Elements stripe={stripePromise} options={{ clientSecret: checkout.clientSecret }}>
          <StripeForm orderId={checkout.orderId} amount={checkout.amountMinor} />
        </Elements>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-line p-3 text-sm">
      <p className="text-muted">Demo mode: no real card is charged. This simulates the payment provider confirming your payment.</p>
      <button type="button" onClick={mockPay} disabled={busy} className="mt-3 min-h-11 w-full rounded-full bg-hot font-semibold text-hot-ink hover:opacity-90 disabled:opacity-50">
        {busy ? "Paying…" : `Pay ${money(checkout.amountMinor)} (test)`}
      </button>
      {error && <p role="alert" className="mt-3 text-hot">{error}</p>}
    </div>
  );
}

function StripeForm({ orderId, amount }: { orderId: string; amount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    const { error: err } = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/orders/${orderId}` } });
    if (err) { setError(err.message ?? "Payment failed."); setBusy(false); }
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement />
      <button type="submit" disabled={!stripe || busy} className="mt-4 min-h-11 w-full rounded-full bg-hot font-semibold text-hot-ink hover:opacity-90 disabled:opacity-50">
        {busy ? "Processing…" : `Pay ${money(amount)}`}
      </button>
      {error && <p role="alert" className="mt-3 rounded-lg bg-hot/10 px-3 py-2 text-sm text-hot">{error}</p>}
      <p className="mt-2 text-xs text-muted">Test mode. Use card 4242 4242 4242 4242, any future date and CVC.</p>
    </form>
  );
}
