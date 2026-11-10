import type { Metadata } from "next";
import { PendingLink } from "@/components/pending-link";
import { ArrowRight, Fingerprint, KeyRound, Lock, QrCode, ShieldCheck, Webhook } from "lucide-react";
import { HowItWorks } from "@/components/how-it-works";
import { SiteFooter } from "@/components/site-footer";
import { GUARANTEES, REPO, SECURITY, STACK } from "@/lib/content";

export const metadata: Metadata = { title: "How it works" };

const ICONS = [KeyRound, ShieldCheck, Webhook, Lock, QrCode, Fingerprint];

export default function HowItWorksPage() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <p className="eyebrow">How it works</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">From the line to your ticket, and what happens when things go wrong.</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">Every guarantee below is backed by an automated test that runs on each change. The full design is in the <a className="link" href={`${REPO}/blob/main/docs/02-SYSTEM-DESIGN.md`}>system design doc</a>.</p>
        <div className="mt-14"><HowItWorks /></div>
      </section>

      <section aria-labelledby="g-title" className="border-t border-line bg-sunk/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="g-title" className="text-3xl font-semibold tracking-tight">What&apos;s guaranteed</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {GUARANTEES.map((g) => (
              <li key={g.title} className="flex flex-col rounded-3xl bg-card p-6 shadow-soft ring-1 ring-line sm:p-8">
                <h3 className="font-semibold">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{g.body}</p>
                <a href={`${REPO}/blob/main/docs/results/${g.doc}`} className="mt-auto inline-flex min-h-11 items-center gap-1 self-start pt-4 text-sm font-medium hover:text-hot">See the test results<ArrowRight aria-hidden className="size-3.5" /></a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="s-title" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="eyebrow">Security and tech</p>
          <h2 id="s-title" className="mt-2 text-3xl font-semibold tracking-tight">Secure by default</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map(([t, b], i) => {
              const I = ICONS[i];
              return (
                <li key={t} className="rounded-3xl bg-card p-6 ring-1 ring-line">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-sunk"><I aria-hidden className="size-4" /></span>
                  <h3 className="mt-4 font-semibold">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-14 text-sm font-semibold">Stack</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {STACK.map((s) => <li key={s} className="pill-surface rounded-full px-3 py-1.5 text-xs font-medium">{s}</li>)}
          </ul>
          <PendingLink href="/events" className="btn-primary mt-14 px-6">Try a ticket drop<ArrowRight aria-hidden className="size-4" /></PendingLink>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
