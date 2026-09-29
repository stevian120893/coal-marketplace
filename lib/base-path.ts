/**
 * Base-path vocabulary for a subdirectory deployment.
 *
 * The marketplace is served from a subdirectory of its domain rather than the
 * domain root:
 *
 *   https://<domain>/ejs-coal/            -> app/page.tsx
 *   https://<domain>/ejs-coal/offer/...   -> app/offer/[token]/page.tsx
 *   https://<domain>/ejs-coal/api/...     -> app/api/.../route.ts
 *
 * APP_BASEPATH is the one place that value is written down. next.config.ts
 * imports it for `basePath`, so the router and this module can never disagree,
 * and the value is a plain constant rather than a runtime environment variable
 * because Next.js resolves `basePath` when the app is built - it cannot vary per
 * request, so pretending it can only hides mistakes.
 *
 * Pure module: no database, no request plumbing, no server-only import, so both
 * server components and client components can use it and every rule is
 * unit-testable without a running app.
 */

/** The subdirectory the app is mounted under. "" means the domain root. */
export const APP_BASEPATH = "/ejs-coal";

/**
 * APP_BASEPATH normalised: exactly one leading slash, no trailing slash, and ""
 * for a root deployment. Normalising once here means every consumer compares
 * against the same spelling, so "/ejs-coal" and "/ejs-coal/" can never drift
 * apart into a doubled or missing prefix.
 */
export const BASE_PATH: string = (() => {
  const trimmed = APP_BASEPATH.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
})();

/**
 * Prefixes an app-absolute path with the base path.
 *
 *   "/api/admin/login"      -> "/ejs-coal/api/admin/login"
 *
 * This is for the URLs Next.js does NOT rewrite on the app's behalf. Link,
 * router.push, redirect and next/image already add the base path themselves, so
 * passing their target through here would double it. Raw `fetch("/api/...")` is
 * a plain browser request that the framework never sees, which is exactly why it
 * has to be wrapped - see the client components in app/admin.
 *
 * Idempotent: a path that already carries the base path is returned unchanged,
 * so "/ejs-coal/api/admin/login" never becomes "/ejs-coal/ejs-coal/api/...".
 */
export function withBasePath(path: string): string {
  const absolute = path.startsWith("/") ? path : `/${path}`;

  if (BASE_PATH === "") return absolute;
  if (absolute === BASE_PATH || absolute.startsWith(`${BASE_PATH}/`)) {
    return absolute;
  }
  return `${BASE_PATH}${absolute}`;
}

/**
 * Appends the base path to an absolute origin, without duplicating it.
 *
 *   "https://example.com"        -> "https://example.com/ejs-coal"
 *   "https://example.com/ejs-coal" -> unchanged
 *
 * Used for the server-side self-fetch base (lib/api-url.ts). The operator may
 * configure APP_BASE_URL either as a bare origin or already including the
 * subdirectory, and both must resolve to the same working URL, so the decision
 * is made once, here, instead of at every call site.
 */
export function joinBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (BASE_PATH === "") return trimmed;

  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === BASE_PATH || path.endsWith(BASE_PATH)) return trimmed;
    url.pathname = `${path}${BASE_PATH}`;
    return url.toString().replace(/\/+$/, "");
  } catch {
    // Not an absolute URL; fall back to plain string handling.
    return trimmed.endsWith(BASE_PATH) ? trimmed : `${trimmed}${BASE_PATH}`;
  }
}
