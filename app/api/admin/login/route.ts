import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminInternalErrorResponse } from "@/lib/admin/authorize";
import {
  checkAdminCredentials,
  getAdminCredentials,
} from "@/lib/admin/credentials";
import { issueAdminSession } from "@/lib/admin/session";

/**
 * Admin sign-in.
 *
 * Two independent gates must pass: the submitted pair must match the
 * environment credentials, and the matching user must be an ACTIVE admin row.
 * A correct password for a buyer account, an inactive admin, or a missing
 * ADMIN_EMAIL all produce the same generic failure.
 *
 * The response body carries the identity only. The session token is delivered
 * exclusively in the HttpOnly cookie set by issueAdminSession, so no client
 * script and no API consumer ever sees it.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/** One message for every credential failure. */
const INVALID_CREDENTIALS = { error: "Email atau kata sandi salah." };

export async function POST(request: NextRequest): Promise<Response> {
  let email: unknown;
  let password: unknown;
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) {
      email = (body as Record<string, unknown>).email;
      password = (body as Record<string, unknown>).password;
    }
  } catch {
    return Response.json(
      { error: "Email dan kata sandi wajib diisi." },
      { status: 400, headers: NO_STORE },
    );
  }

  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json(
      { error: "Email dan kata sandi wajib diisi." },
      { status: 400, headers: NO_STORE },
    );
  }

  // Fail closed: without the environment pair, nobody can sign in.
  const expected = getAdminCredentials();
  if (expected === null) {
    return adminInternalErrorResponse();
  }

  if (!checkAdminCredentials(email, password, expected).ok) {
    return Response.json(INVALID_CREDENTIALS, {
      status: 401,
      headers: NO_STORE,
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: expected.email },
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    // The environment pair is not itself a permission: it must resolve to a
    // real, active admin account.
    if (
      user === null ||
      user.role !== "ADMIN" ||
      user.status !== "ACTIVE"
    ) {
      return Response.json(INVALID_CREDENTIALS, {
        status: 401,
        headers: NO_STORE,
      });
    }

    await issueAdminSession(user.id);

    return Response.json(
      {
        admin: { id: user.id, email: user.email, name: user.name },
      },
      { status: 200, headers: NO_STORE },
    );
  } catch {
    return adminInternalErrorResponse();
  }
}
