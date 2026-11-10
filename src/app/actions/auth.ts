"use server";

import { signIn, signOut } from "@/auth";

const ALLOWED = new Set(["google", "github"]);

/** Only allow redirects back into this site (blocks open-redirect tricks via callbackUrl). */
function safeCallback(raw: unknown): string {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export async function signInWith(formData: FormData) {
  const provider = String(formData.get("provider"));
  if (!ALLOWED.has(provider)) throw new Error("Unknown provider");
  await signIn(provider, { redirectTo: safeCallback(formData.get("to")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
