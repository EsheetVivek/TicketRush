/** Shown instantly (and prefetched) while the order page renders on the server. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16" aria-busy="true">
      <p className="eyebrow">Your order</p>
      <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl"><span aria-hidden className="spinner text-muted" />Confirming your payment…</h1>
      <p className="mt-2 text-muted">This usually takes a second.</p>
      <div className="card mt-8 h-24 animate-pulse" />
    </main>
  );
}
