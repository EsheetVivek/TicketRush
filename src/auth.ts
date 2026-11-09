import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

/**
 * Anyone can create an account by signing in with Google or GitHub: the first sign-in creates the
 * user. A provider is only switched on when its credentials are configured.
 */
function enabledProviders() {
  const list = [];
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) list.push(Google);
  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) list.push(GitHub);
  return list;
}

export const PROVIDERS = [
  { id: "google", name: "Google", on: () => !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) },
  { id: "github", name: "GitHub", on: () => !!(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) },
] as const;

/**
 * Database sessions: the browser only holds an opaque, httpOnly, Secure, SameSite=Lax
 * session cookie. Sessions can be revoked server-side by deleting the row.
 */
const nextAuth = NextAuth({
  adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  providers: enabledProviders(),
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,
  callbacks: {
    // Expose the user id to server code; nothing else from the DB user is sent to the browser.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
export const { auth, signIn, signOut } = nextAuth;
export const { GET, POST } = nextAuth.handlers;
