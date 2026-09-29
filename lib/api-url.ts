import { headers } from "next/headers";
import { joinBaseUrl } from "@/lib/base-path";

/**
 * Absolute base URL for server-side fetches and link building.
 *
 * Server components get relative URLs only from the browser, so the request
 * needs an absolute origin. Derived from the incoming request unless
 * APP_BASE_URL is configured (when the app sits behind a proxy that rewrites
 * host headers). Shared by the admin pages (lib/server-api.ts), the buyer
 * offer page, the shared catalog pages, and the access-link route, so the
 * origin logic lives in exactly one place.
 *
 * The result always includes the deployment's base path, because every caller
 * appends a route that Next.js serves from inside the subdirectory:
 *
 *   https://<domain>/ejs-coal + /api/listings
 *     -> https://<domain>/ejs-coal/api/listings
 *
 * joinBaseUrl is idempotent, so an APP_BASE_URL that already includes the
 * subdirectory is not prefixed a second time.
 */

export async function apiBaseUrl(): Promise<string> {
  if (process.env.APP_BASE_URL) return joinBaseUrl(process.env.APP_BASE_URL);
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = requestHeaders.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return joinBaseUrl(`${proto}://${host}`);
}