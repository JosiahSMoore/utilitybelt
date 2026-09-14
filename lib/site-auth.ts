import { createHmac, timingSafeEqual } from "crypto";

// A single shared password gates the whole site — there's no per-user
// concept here, matching the single-user architecture everywhere else in
// this app. The cookie's value is an HMAC of a fixed payload, keyed by the
// password itself: correct password in, matching signature out. This also
// means changing SITE_PASSWORD instantly invalidates every previously
// issued cookie (old ones were signed with the old password), which is a
// free "sign out everywhere" if that's ever needed.
export const AUTH_COOKIE_NAME = "site_auth";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 years

const TOKEN_PAYLOAD = "authenticated";

function sign(secret: string): string {
  return createHmac("sha256", secret).update(TOKEN_PAYLOAD).digest("hex");
}

export function createAuthToken(): string {
  const secret = process.env.SITE_PASSWORD;
  if (!secret) throw new Error("Missing SITE_PASSWORD environment variable.");
  return sign(secret);
}

export function isValidAuthToken(token: string | undefined): boolean {
  const secret = process.env.SITE_PASSWORD;
  if (!secret || !token) return false;
  const expected = sign(secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isCorrectPassword(candidate: string): boolean {
  return Boolean(process.env.SITE_PASSWORD) && candidate === process.env.SITE_PASSWORD;
}

// Only ever redirect to a same-origin path after login — a "next" value
// lifted from a query string is attacker-controlled input, and without this
// check someone could craft a login link that bounces a visitor off-site
// after they type in the real password.
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
