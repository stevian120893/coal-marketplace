import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCESS_TOKEN_TTL_DAYS,
  buildBuyerOfferUrl,
  generateRawAccessToken,
} from "../../lib/access-links";

/**
 * Unit tests for buyer access-link generation: the raw secret format (a 32-byte
 * base64url bearer credential the admin hands to the buyer exactly once) and
 * the URL builder that turns it into https://<domain>/offer/<slug>-<secret>.
 */

test("minted secrets are unique 32-byte base64url strings", () => {
  const first = generateRawAccessToken();
  const second = generateRawAccessToken();
  assert.notEqual(first, second);
  assert.equal(first.length, 43); // 32 bytes -> 43 base64url characters
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.equal(first.includes("="), false, "base64url has no padding");
});

test("links keep the 7-day expiry used by the seed tokens", () => {
  assert.equal(ACCESS_TOKEN_TTL_DAYS, 7);
});

test("buildBuyerOfferUrl joins the origin, slug and secret", () => {
  assert.equal(
    buildBuyerOfferUrl("https://market.example", "andi-prasetyo", "abc123"),
    "https://market.example/offer/andi-prasetyo-abc123",
  );
});

test("buildBuyerOfferUrl strips a trailing slash from the base", () => {
  assert.equal(
    buildBuyerOfferUrl("https://market.example/", "andi", "abc123"),
    "https://market.example/offer/andi-abc123",
  );
});

test("buildBuyerOfferUrl falls back to the bare secret when there is no slug", () => {
  assert.equal(
    buildBuyerOfferUrl("https://market.example", null, "abc123"),
    "https://market.example/offer/abc123",
  );
});

test("secrets are URL-safe base64url, so the built link needs no encoding", () => {
  const secret = generateRawAccessToken();
  const url = buildBuyerOfferUrl("https://market.example", "andi-prasetyo", secret);
  assert.ok(url.endsWith(`/offer/andi-prasetyo-${secret}`));
  assert.doesNotMatch(url, /[^A-Za-z0-9._~:/@!$&'()*+,;=-]/);
});