import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFER_SECRET_LENGTH,
  buyerSlug,
  isOfferSecret,
  splitOfferPath,
} from "../../lib/offer-link";

/**
 * The buyer-link URL vocabulary: slug generation and the deterministic
 * slug-vs-secret split of /offer/<...> path values.
 *
 * Rules pinned here:
 *   - the secret is always the final fixed-length (43-char) base64url segment;
 *   - a bare 43-char base64url value is a legacy raw token (secret = the whole
 *     value, no slug);
 *   - anything else is a legacy raw token of arbitrary length;
 *   - the slug is informational and never affects authentication, but the
 *     parser must survive hyphenated slugs and base64url secrets containing
 *     '-' or '_'.
 */

const SECRET = "x".repeat(43); // still a valid 43-char base64url value

test("the offer secret has a fixed length of 43 characters", () => {
  assert.equal(OFFER_SECRET_LENGTH, 43);
  assert.equal(SECRET.length, 43);
});

test("isOfferSecret accepts exact-size base64url and rejects everything else", () => {
  assert.equal(isOfferSecret(SECRET), true);
  assert.equal(isOfferSecret("ABc_12-3".repeat(4) + "ABc"), false); // 39 chars
  assert.equal(isOfferSecret(`x${SECRET}`), false); // 44 chars
  assert.equal(isOfferSecret("not base64url! ".repeat(4).slice(0, 43)), false);
});

test("a bare 43-char value parses as a legacy raw token (no slug)", () => {
  const parts = splitOfferPath(SECRET);
  assert.deepEqual(parts, { slug: null, secret: SECRET });
});

test("a single-word slug splits at the dash", () => {
  const parts = splitOfferPath(`andi-${SECRET}`);
  assert.deepEqual(parts, { slug: "andi", secret: SECRET });
});

test("a hyphenated slug still splits at the true boundary", () => {
  const parts = splitOfferPath(`andi-prasetyo-${SECRET}`);
  assert.deepEqual(parts, { slug: "andi-prasetyo", secret: SECRET });
});

test("a secret containing '-' or '_' is still the fixed-length tail", () => {
  const tricky = `${"A".repeat(20)}-B_C${"z".repeat(19)}`;
  assert.equal(tricky.length, 43);
  const parts = splitOfferPath(`buyer-co-${tricky}`);
  assert.deepEqual(parts, { slug: "buyer-co", secret: tricky });
});

test("an unprefixed legacy raw token of arbitrary length passes through whole", () => {
  // Pre-model links used arbitrary strings (e.g. test fixtures).
  assert.deepEqual(splitOfferPath("legacy-raw-token"), {
    slug: null,
    secret: "legacy-raw-token",
  });
  assert.deepEqual(splitOfferPath("test-user-0123456789abcdef"), {
    slug: null,
    secret: "test-user-0123456789abcdef",
  });
});

test("buyerSlug lowercases a name into a URL-safe slug", () => {
  assert.equal(buyerSlug("Andi Prasetyo"), "andi-prasetyo");
  assert.equal(buyerSlug("PT. Sinar Baru"), "pt-sinar-baru");
  assert.equal(buyerSlug(" O'Brien "), "o-brien");
});

test("buyerSlug collapses runs of separators and trims edge dashes", () => {
  assert.equal(buyerSlug("Andi   Prasetyo"), "andi-prasetyo");
  assert.equal(buyerSlug("--Andi--"), "andi");
});

test("buyerSlug returns null when nothing slug-able remains", () => {
  assert.equal(buyerSlug(null), null);
  assert.equal(buyerSlug(undefined), null);
  assert.equal(buyerSlug(""), null);
  assert.equal(buyerSlug("   "), null);
  assert.equal(buyerSlug("!!!"), null);
});