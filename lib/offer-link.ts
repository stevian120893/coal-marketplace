/**
 * Buyer magic-link URL vocabulary.
 *
 * A buyer receives ONE personalized link per buyer, not one per listing:
 *
 *   /offer/andi-prasetyo-x7K92mQa...
 *
 * The link has two purposes:
 *
 *   andi-prasetyo  -> human-readable buyer slug (informational ONLY)
 *   x7K92mQa...    -> the secret authorization credential (43 base64url chars)
 *
 * The secret is the only security. The slug is never part of authentication;
 * it exists so the recipient can recognise whose link it is. Both the new
 * <slug>-<secret> format and the legacy bare /offer/<raw-token> format are
 * supported.
 *
 * Because the secret has a fixed length, the parser is deterministic: the
 * final 43-character base64url segment is the secret, and everything before
 * the single dash that separates it is the slug. This works even when the slug
 * itself contains hyphens ("andi-prasetyo-secret") and when the base64url
 * secret contains "-" or "_" - no slug can swallow the fixed-length tail.
 *
 * Pure module: no database or request plumbing, so every rule is unit-testable.
 */

/** 32 random bytes -> 43 base64url characters (the secret's fixed length). */
export const OFFER_SECRET_LENGTH = 43;

const SECRET_RE = /^[A-Za-z0-9_-]+$/;

/** True when the value alone is exactly one well-formed raw token. */
export function isOfferSecret(value: string): boolean {
  return value.length === OFFER_SECRET_LENGTH && SECRET_RE.test(value);
}

export type OfferPathParts = {
  /** Human-readable buyer slug. Informational only; never used for auth. */
  slug: string | null;
  /** The secret credential: hash this, look it up, nothing else. */
  secret: string;
};

/**
 * Splits a /offer/<...> path value into its slug and secret parts.
 *
 * Deterministic rules, in order:
 *   1. a bare 43-char base64url value is a legacy raw token - the whole value
 *      is the secret;
 *   2. otherwise, when the value ends with "-" + a 43-char base64url segment,
 *      that final segment is the secret and everything before the dash is the
 *      slug (the dash is matched greedily, so a hyphenated slug still splits
 *      at the true boundary);
 *   3. anything else is a legacy raw token of arbitrary length - the whole
 *      value is the secret.
 */
export function splitOfferPath(value: string): OfferPathParts {
  if (isOfferSecret(value)) {
    return { slug: null, secret: value };
  }

  const tail = value.slice(-OFFER_SECRET_LENGTH);
  const dashIndex = value.length - OFFER_SECRET_LENGTH - 1;
  if (dashIndex >= 0 && value[dashIndex] === "-" && isOfferSecret(tail)) {
    return { slug: value.slice(0, dashIndex), secret: tail };
  }

  // Legacy raw tokens (older links and test fixtures) are arbitrary strings.
  return { slug: null, secret: value };
}

/**
 * Deterministic URL-safe slug for a buyer's contact name:
 * "Andi Prasetyo" -> "andi-prasetyo". Returns null when nothing slug-able
 * remains. The slug is display-only and never authorises anything.
 */
export function buyerSlug(name: string | null | undefined): string | null {
  if (name === null || name === undefined) return null;
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length === 0 ? null : slug;
}

/** Builds the personalized buyer link https://<domain>/offer/<slug>-<secret>. */
export function buildBuyerOfferUrl(
  baseUrl: string,
  slug: string | null,
  secret: string,
): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const prefix = slug === null || slug.length === 0 ? "" : `${slug}-`;
  return `${trimmed}/offer/${prefix}${secret}`;
}