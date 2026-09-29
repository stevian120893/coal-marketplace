import { cookies } from "next/headers";
import { apiBaseUrl } from "@/lib/api-url";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";

/**
 * Server-side helper for the admin pages to read their own JSON API.
 *
 * The admin pages fetch the endpoints rather than querying Prisma directly, so
 * the screens always render exactly the contract the API exposes and the API
 * stays usable on its own. Results are never cached: an admin view must not be
 * served from a shared cache.
 *
 * The admin session cookie is forwarded on the self-fetch. A server component's
 * own fetch carries no browser cookies, so without this the API - which now
 * requires a session - would reject the page that is already authenticated. Only
 * the admin cookie is passed on; unrelated cookies stay behind.
 */

export type AdminApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number };

/** The admin session cookie, or null when the visitor has no session. */
async function sessionCookieHeader(): Promise<string | undefined> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (token === undefined) return undefined;
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

/** Any non-2xx answer is a failure; the status is kept so pages can tell 404
 *  apart from a genuine error. */
export async function fetchAdminApi<T>(
  path: string,
): Promise<AdminApiResult<T>> {
  const cookie = await sessionCookieHeader();

  let response: Response;
  try {
    response = await fetch(`${await apiBaseUrl()}${path}`, {
      cache: "no-store",
      // The page has already authorised the visitor via requireAdminPage, so a
      // 401 here would mean the session was revoked mid-render, not that the
      // data may be shown.
      ...(cookie === undefined ? {} : { headers: { cookie } }),
    });
  } catch {
    return { ok: false, status: 0 };
  }

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}
