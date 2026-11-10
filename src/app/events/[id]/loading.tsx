import { Bar } from "@/components/skeletons";

export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading seat map" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
      <Bar className="h-10 w-28" />
      <Bar className="mt-6 h-3 w-40" /><Bar className="mt-4 h-9 w-80 max-w-full" /><Bar className="mt-3 h-4 w-48" />
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid grid-cols-12 gap-1.5 rounded-3xl bg-card p-6 ring-1 ring-line">
          {Array.from({ length: 96 }, (_, i) => <span key={i} className="aspect-square animate-pulse rounded-md bg-sunk" style={{ animationDelay: `${(i % 12) * 40}ms` }} />)}
        </div>
        <div className="space-y-3 rounded-3xl bg-card p-6 ring-1 ring-line"><Bar className="h-5 w-1/2" /><Bar className="h-3 w-3/4" /><Bar className="mt-6 h-11 w-full" /></div>
      </div>
    </main>
  );
}
