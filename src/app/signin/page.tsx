import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, PROVIDERS } from "@/auth";
import { signInWith } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Sign in" };

/** Only allow redirects back into this site (blocks open-redirect tricks via callbackUrl). */
function safeCallback(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email is already linked to a different sign-in method. Use the one you signed up with.",
  AccessDenied: "Sign-in was cancelled.",
  Configuration: "Sign-in isn't set up correctly. Try again later.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const to = safeCallback(callbackUrl);
  if ((await auth())?.user) redirect(to);
  const providers = PROVIDERS.filter((p) => p.on());

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <p className="eyebrow">New here or coming back</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to TicketRush</h1>
      <p className="mt-3 text-muted">Your account is created the first time you sign in. We only use your name and email.</p>

      {error && <p role="alert" className="mt-6 rounded-xl bg-hot-soft px-4 py-3 text-sm">{ERRORS[error] ?? "Sign-in didn't work. Try again."}</p>}

      <div className="mt-8 flex flex-col gap-3">
        {providers.map((p) => (
          <form key={p.id} action={signInWith}>
            <input type="hidden" name="provider" value={p.id} />
            <input type="hidden" name="to" value={to} />
            <SubmitButton pendingLabel={`Opening ${p.name}…`} className="btn-secondary min-h-12 w-full gap-3 text-base">
              <ProviderIcon id={p.id} />
              Continue with {p.name}
            </SubmitButton>
          </form>
        ))}
        {providers.length === 0 && <p className="text-sm text-muted">No sign-in method is configured yet.</p>}
      </div>
      <p className="mt-8 text-xs text-muted">Payments run in test mode. No real money is ever charged.</p>
    </main>
  );
}

function ProviderIcon({ id }: { id: string }) {
  if (id === "google") {
    return (
      <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
      </svg>
    );
  }
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}
