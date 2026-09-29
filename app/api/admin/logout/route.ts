import { adminInternalErrorResponse } from "@/lib/admin/authorize";
import { revokeCurrentAdminSession } from "@/lib/admin/session";

/**
 * Admin sign-out.
 *
 * Revokes the session row rather than only clearing the cookie, so a token
 * captured before logout is dead server-side. Safe to call repeatedly and safe
 * to call with no cookie: the cookie is cleared either way.
 *
 * Deliberately unauthenticated - a logout must still clear the cookie when the
 * session has already expired, and revealing nothing here is harmless.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  try {
    await revokeCurrentAdminSession();
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return adminInternalErrorResponse();
  }
}
