import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Admin session lifecycle: issuing, transporting, and revoking sessions.
 *
 * The raw session token is a bearer credential and is treated the same way the
 * buyer magic link is: it exists only in the admin's HTTP-only cookie, while
 * the database stores nothing but its SHA-256 hash. Neither the raw token nor
 * the hash is ever logged or returned in a response body.
 */

export const ADMIN_SESSION_COOKIE = "admin_session";

/** Sessions last a week, matching the cookie's maxAge. */
export const ADMIN_SESSION_TTL_DAYS = 7;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Cookie lifetimes are expressed in seconds, not milliseconds. */
const ONE_DAY_SECONDS = ONE_DAY_MS / 1000;

/**
 * Path is "/" on purpose. A "/admin" path would be tighter, but the admin JSON
 * API lives under /api/admin/*, which a "/admin" cookie would never be sent to,
 * so the API would stop receiving it. The cookie is HttpOnly and SameSite=Lax,
 * and only the admin code reads it.
 */
function cookieOptions() {
  return {
    httpOnly: true,
    // Only sent over TLS in production; plain http on localhost is unusable
    // otherwise, since the browser would drop the cookie.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // Seconds. Passing milliseconds here would silently stretch a 7-day session
    // into decades.
    maxAge: ADMIN_SESSION_TTL_DAYS * ONE_DAY_SECONDS,
  };
}

/** 32 random bytes, URL-safe so it survives a cookie value verbatim. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a session and sets the cookie. Returns the raw token so the caller
 * can decide how to hand it back - the cookie is set here, and the raw value
 * is never returned in an API response.
 */
export async function issueAdminSession(
  userId: string,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateSessionToken();
  // Computed here, in the app's own clock, rather than by the database: the
  // column is `timestamp without time zone`, so a server-side now() would be
  // written in the database's own timezone and read back as the wrong instant.
  // This matches the TTL the cookie itself advertises.
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_DAYS * ONE_DAY_MS);

  await prisma.adminSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(rawToken),
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, rawToken, cookieOptions());

  return { rawToken, expiresAt };
}

/**
 * Revokes the session behind the current cookie and clears it. Safe to call
 * when no session is presented: the cookie is cleared either way.
 */
export async function revokeCurrentAdminSession(): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(ADMIN_SESSION_COOKIE)?.value;

  if (rawToken !== undefined) {
    // Idempotent: revoking an already-revoked session is a no-op update, and
    // an unknown token simply matches nothing.
    await prisma.adminSession.updateMany({
      where: { tokenHash: hashSessionToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  store.set(ADMIN_SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}
