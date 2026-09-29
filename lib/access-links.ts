/**
 * Buyer access-link generation for the admin console.
 *
 * A link is https://<domain>/offer/<buyer-slug>-<raw-secret>. The slug is a
 * human-readable buyer label (informational only); the raw secret is the bearer
 * credential. It exists only in the link handed to the buyer (copied or opened
 * from the admin screen), while the database stores only its SHA-256 hash via
 * the existing AccessToken model. Those semantics belong to lib/offer-auth.ts
 * (hashOfferToken); this module only mints the raw value and builds the URL.
 *
 * Generation is deliberately separate from the storage route so the reuse rule
 * ("issuing a new link must never silently invalidate a still-valid one") stays
 * in one place, in the route that owns the database transaction.
 *
 * Pure module: no database or request plumbing, so every rule is unit-testable.
 */

import { randomBytes } from "node:crypto";

/** Expiry for newly minted links, matching the seed's 7-day token life. */
export const ACCESS_TOKEN_TTL_DAYS = 7;

/** 32 random bytes, URL-safe so it survives a URL query verbatim. */
export function generateRawAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

// The URL vocabulary (slugify, fixed-height secret parsing, link building)
// lives in lib/offer-link.ts and is re-exported here so admin code has one
// access-link module to import from.
export {
  OFFER_SECRET_LENGTH,
  buyerSlug,
  splitOfferPath,
  isOfferSecret,
  buildBuyerOfferUrl,
} from "./offer-link";
export type { OfferPathParts } from "./offer-link";