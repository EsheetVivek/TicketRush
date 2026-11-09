import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

/**
 * Database sessions: the browser only holds an opaque, httpOnly, Secure, SameSite=Lax
 * session cookie. Sessions can be revoked server-side by deleting the row.
 */
const nextAuth = NextAuth({
  adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  providers: [GitHub],
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
