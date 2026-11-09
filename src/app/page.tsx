import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">Milestone 1 · skeleton</p>
      <h1 className="text-5xl font-bold tracking-tight">TicketRush</h1>
      <p className="text-lg text-neutral-600">
        Event ticketing built for flash-sale ticket drops: fair queues, no double-sold seats, and automatic refunds when payments fail.
      </p>
      {session?.user ? (
        <form action={async () => { "use server"; await signOut(); }} className="flex items-center gap-4">
          <span>Signed in as {session.user.name ?? session.user.email}</span>
          <button className="rounded-full border px-4 py-2" type="submit">Sign out</button>
        </form>
      ) : (
        <form action={async () => { "use server"; await signIn("github"); }}>
          <button className="rounded-full bg-black px-5 py-3 font-semibold text-white" type="submit">Sign in with GitHub</button>
        </form>
      )}
    </main>
  );
}
