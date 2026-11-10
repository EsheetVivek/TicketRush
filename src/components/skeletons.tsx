/** Lightweight placeholders shown instantly while a page's data loads (used by loading.tsx files). */
export function Bar({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-full bg-sunk ${className}`} />;
}

export function PageSkeleton({ cards = 2, title = "Loading" }: { cards?: number; title?: string }) {
  return (
    <main aria-busy="true" aria-label={title} className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Bar className="h-3 w-24" />
      <Bar className="mt-4 h-9 w-72 max-w-full" />
      <Bar className="mt-4 h-4 w-96 max-w-full" />
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-3xl bg-card ring-1 ring-line">
            <div className="h-44 animate-pulse bg-sunk sm:h-52" />
            <div className="space-y-3 p-5"><Bar className="h-5 w-2/3" /><Bar className="h-3 w-1/2" /><Bar className="h-3 w-1/3" /></div>
          </div>
        ))}
      </div>
    </main>
  );
}
