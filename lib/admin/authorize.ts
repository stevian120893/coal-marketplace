import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, hashSessionToken } from "./session";

/**
 * The single authorization entry point for the admin area.
 *
 * Every admin API route and every admin page resolves its access through this
 * module, so the rules live in exactly one place. When a real session check
 * landed here, all of them would start enforcing it together; that is the
 * reason the placeholder was factored out in the first place.
 *
 * The chain is: read the HTTP-only cookie, hash the token, load the session,
 * reject it if revoked or expired, load the linked user, and require
 * role = ADMIN with status = ACTIVE. Role is read only from the database, so
 * nothing the browser sends - cookie contents, query string, or body - can
 * influence the outcome.
 *
 * This area is independent of the buyer magic link: no admin route accepts,
 * forwards, or resolves an AccessToken, and buyer authentication is untouched.
 */

const NO_STORE = { "Cache-Control": "no-store" };

/** What the UI is allowed to know about the signed-in admin. */
export type AdminIdentity = {
  id: string;
  email: string | null;
  name: string | null;
};

/**
 * 401 means "no usable session" (missing, unknown, expired, revoked); 403 means
 * "a real session, but this account may not use the console" (wrong role or an
 * inactive account). Both answer with the same generic message.
 */
export type AdminAuthResult =
  | { ok: true; admin: AdminIdentity }
  | { ok: false; status: 401 | 403 };

/**
 * Verifies a raw session token and returns the admin behind it.
 *
 * Throws if the database is unreachable so callers can answer 500 rather than
 * treating an outage as a failed login.
 */
export async function authenticateAdminSession(
  rawToken: string | undefined,
): Promise<AdminAuthResult> {
  if (rawToken === undefined || rawToken.length === 0) {
    return { ok: false, status: 401 };
  }

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(rawToken) },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
        },
      },
    },
  });

  if (session === null) return { ok: false, status: 401 };
  if (session.revokedAt !== null) return { ok: false, status: 401 };
  if (session.expiresAt.getTime() <= Date.now()) return { ok: false, status: 401 };

  // Authorisation is decided by the database row, never by the client.
  if (session.user.role !== "ADMIN") return { ok: false, status: 403 };
  if (session.user.status !== "ACTIVE") return { ok: false, status: 403 };

  return {
    ok: true,
    admin: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  };
}

/** Authorises an admin API request from its session cookie. */
export async function authorizeAdminRequest(
  request: NextRequest,
): Promise<AdminAuthResult> {
  return authenticateAdminSession(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
}

/**
 * Authorises an admin page from the incoming request cookies.
 *
 * Pages call this before they fetch or render anything, so no quote-request
 * data is read or sent to the browser for an unauthenticated visitor.
 */
export async function authorizeAdminPage(): Promise<AdminAuthResult> {
  const store = await cookies();
  return authenticateAdminSession(store.get(ADMIN_SESSION_COOKIE)?.value);
}

/** Redirects an unauthenticated visitor to the login page. */
export async function requireAdminPage(): Promise<AdminIdentity> {
  const auth = await authorizeAdminPage();
  if (!auth.ok) {
    redirect("/admin/login");
  }
  return auth.admin;
}

/** One indistinguishable message for both cases, so a response never reveals
 *  whether an identity was presented and rejected. */
export function adminAuthErrorResponse(status: 401 | 403): Response {
  return Response.json(
    { error: "Akses tidak diizinkan." },
    { status, headers: NO_STORE },
  );
}

/**
 * Prisma connection failures embed the connection string, so the reason is
 * never forwarded to the client.
 */
export function adminInternalErrorResponse(): Response {
  return Response.json(
    { error: "Terjadi kesalahan pada server." },
    { status: 500, headers: NO_STORE },
  );
}
