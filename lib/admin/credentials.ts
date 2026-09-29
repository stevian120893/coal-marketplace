import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Admin credentials, sourced from the environment only.
 *
 * Nothing here is hardcoded and no password is ever logged, returned, or
 * stored. The pair is the bootstrap identity; the authoritative permission check
 * is still the User row's role and status, which is re-read on every request.
 *
 * The comparison is constant time: both sides are hashed to a fixed 32 bytes
 * first, because timingSafeEqual throws on length mismatch - which would itself
 * leak the length of the configured password.
 */

export type AdminCredentials = {
  email: string;
  password: string;
};

/**
 * Reads and validates the credential environment variables.
 *
 * Returns null when either is missing or blank so callers can fail closed
 * rather than fall back to a default.
 */
export function getAdminCredentials(): AdminCredentials | null {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (email === undefined || email.length === 0) return null;
  if (password === undefined || password.length === 0) return null;

  return { email, password };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time equality for arbitrary-length strings. */
export function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export type CredentialCheck =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "invalid" };

/**
 * Verifies a submitted email/password pair against the environment.
 *
 * Every failure returns the same reason, so a caller cannot tell a wrong email
 * from a wrong password - and the caller still performs a comparison on the
 * unknown-email path so the two take comparable time.
 */
export function checkAdminCredentials(
  email: string,
  password: string,
  expected: AdminCredentials,
): CredentialCheck {
  const emailMatches = secretsMatch(
    email.trim().toLowerCase(),
    expected.email.toLowerCase(),
  );
  const passwordMatches = secretsMatch(password, expected.password);

  if (!emailMatches || !passwordMatches) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}
