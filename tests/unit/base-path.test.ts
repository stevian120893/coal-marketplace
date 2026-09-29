import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_BASEPATH,
  BASE_PATH,
  joinBaseUrl,
  withBasePath,
} from "../../lib/base-path";
import { buildBuyerOfferUrl } from "../../lib/offer-link";
import { buildSendDealWhatsAppUrl } from "../../lib/whatsapp";

/**
 * Base-path rules for the subdirectory deployment.
 *
 * Next.js applies basePath by itself to Link, router.push, redirect and
 * next/image, so those never appear here. What is tested is the half Next.js
 * cannot see: raw fetch() calls, absolute server-side self-fetches, and the
 * minted buyer link. Getting these wrong sends the browser to the domain root
 * and 404s, so they are pinned here rather than discovered in production.
 */

/** The literal used throughout, so a basePath change updates these too. */
const SUB = "/ejs-coal";

test("basePath is a normalised, prefix-safe constant", () => {
  assert.equal(APP_BASEPATH, SUB);
  assert.equal(BASE_PATH, SUB);
  // Exactly one leading slash, no trailing slash: a doubled or missing slash
  // here is what produces "/ejs-coal//api" or "/api" in production.
  assert.ok(BASE_PATH.startsWith("/"));
  assert.ok(!BASE_PATH.endsWith("/"));
  assert.ok(!BASE_PATH.includes("//"));
});

test("client fetch paths carry the base path", () => {
  assert.equal(withBasePath("/api/admin/login"), `${SUB}/api/admin/login`);
  assert.equal(withBasePath("/api/admin/logout"), `${SUB}/api/admin/logout`);
  assert.equal(
    withBasePath("/api/admin/access-links"),
    `${SUB}/api/admin/access-links`,
  );
  assert.equal(
    withBasePath(`/api/offer/${encodeURIComponent("tok en/1")}/quote`),
    `${SUB}/api/offer/${encodeURIComponent("tok en/1")}/quote`,
  );
  // Dynamic segments built from encodeURIComponent must survive unchanged.
  assert.equal(
    withBasePath(`/api/admin/listings/${encodeURIComponent("id/../x")}`),
    `${SUB}/api/admin/listings/id%2F..%2Fx`,
  );
});

test("every admin and buyer API route resolves inside the subdirectory", () => {
  // The full client-side surface, so a new call site cannot silently skip the
  // wrapper: each of these is a raw fetch() the framework never rewrites.
  const apiPaths = [
    "/api/admin/login",
    "/api/admin/logout",
    "/api/admin/access-links",
    "/api/admin/buyers",
    "/api/admin/buyers/b1",
    "/api/admin/listings",
    "/api/admin/listings/l1",
    "/api/admin/quote-requests",
    "/api/admin/quote-requests/q1",
    "/api/admin/quote-requests/q1/transaction",
    "/api/admin/transactions",
    "/api/admin/transactions/t1",
    "/api/offer/abc/quote",
    "/api/offer/abc/deals",
  ];
  for (const path of apiPaths) {
    const result = withBasePath(path);
    assert.equal(result, `${SUB}${path}`, `${path} must sit under the base path`);
    assert.ok(
      result.startsWith(`${SUB}/api/`),
      `${path} resolved outside the base path: ${result}`,
    );
  }
});

test("withBasePath is idempotent, so the prefix is never doubled", () => {
  assert.equal(withBasePath(`${SUB}/api/admin/login`), `${SUB}/api/admin/login`);
  // A bare path that merely shares a prefix must still be prefixed.
  assert.equal(withBasePath("/ejs-coal-news"), `${SUB}/ejs-coal-news`);
  assert.equal(withBasePath(SUB), SUB);
  // Applying it twice changes nothing.
  const once = withBasePath("/api/listings");
  assert.equal(withBasePath(once), once);
  assert.ok(!withBasePath(once).includes(`${SUB}${SUB}`));
});

test("withBasePath tolerates a missing leading slash", () => {
  assert.equal(withBasePath("api/admin/login"), `${SUB}/api/admin/login`);
});

test("server self-fetch base includes the subdirectory", () => {
  assert.equal(joinBaseUrl("https://www.myinfiniteboon.com"), `https://www.myinfiniteboon.com${SUB}`);
  assert.equal(
    joinBaseUrl(`https://www.myinfiniteboon.com${SUB}`),
    `https://www.myinfiniteboon.com${SUB}`,
  );
  // Trailing slashes are normalised away rather than producing "//api".
  assert.equal(
    joinBaseUrl("https://www.myinfiniteboon.com/"),
    `https://www.myinfiniteboon.com${SUB}`,
  );
  assert.equal(
    joinBaseUrl(`https://www.myinfiniteboon.com${SUB}/`),
    `https://www.myinfiniteboon.com${SUB}`,
  );
});

test("APP_BASE_URL keeps its subdirectory and is never doubled", () => {
  // The documented production spelling.
  const configured = "https://www.myinfiniteboon.com/ejs-coal";
  const base = joinBaseUrl(configured);
  assert.equal(base, configured);
  assert.ok(!base.includes(`${SUB}${SUB}`));

  // The self-fetch URLs the admin pages actually build.
  assert.equal(
    `${base}/api/listings`,
    "https://www.myinfiniteboon.com/ejs-coal/api/listings",
  );
  assert.equal(
    `${base}/api/admin/buyers`,
    "https://www.myinfiniteboon.com/ejs-coal/api/admin/buyers",
  );
  assert.equal(
    `${base}/api/admin/transactions`,
    "https://www.myinfiniteboon.com/ejs-coal/api/admin/transactions",
  );
  assert.equal(
    `${base}/api/admin/quote-requests`,
    "https://www.myinfiniteboon.com/ejs-coal/api/admin/quote-requests",
  );

  // A bare origin is repaired to the same result, so either spelling works.
  assert.equal(
    joinBaseUrl("https://www.myinfiniteboon.com"),
    "https://www.myinfiniteboon.com/ejs-coal",
  );
});

test("no server-built API URL escapes the subdirectory", () => {
  const base = joinBaseUrl("https://www.myinfiniteboon.com");
  for (const path of [
    "/api/listings",
    "/api/admin/buyers",
    "/api/admin/transactions",
    "/api/admin/quote-requests",
  ]) {
    const url = `${base}${path}`;
    assert.ok(url.startsWith(`https://www.myinfiniteboon.com${SUB}/api/`), url);
    assert.equal(url.includes("myinfiniteboon.com/api/"), false, url);
  }
});

test("the buyer magic link points at the subdirectory", () => {
  const base = joinBaseUrl("https://www.myinfiniteboon.com/ejs-coal");
  const secret = "x".repeat(43);
  const url = buildBuyerOfferUrl(base, "andi-prasetyo", secret);

  assert.equal(
    url,
    `https://www.myinfiniteboon.com${SUB}/offer/andi-prasetyo-${secret}`,
  );
  assert.ok(url.startsWith("https://www.myinfiniteboon.com/ejs-coal/offer/"));
  // The origin must not be a bare-domain link, which would 404.
  assert.equal(url.startsWith("https://www.myinfiniteboon.com/offer/"), false);
  // The base path must not be repeated inside the link.
  assert.equal(url.includes(`${SUB}${SUB}`), false);

  // Same result whether the operator configured the base with or without the
  // subdirectory, so the buyer link cannot depend on that spelling choice.
  assert.equal(
    buildBuyerOfferUrl(joinBaseUrl("https://www.myinfiniteboon.com"), "andi-prasetyo", secret),
    url,
  );

  // A slug-less legacy link still lands in the subdirectory.
  assert.equal(
    buildBuyerOfferUrl(base, null, secret),
    `https://www.myinfiniteboon.com${SUB}/offer/${secret}`,
  );
});

test("WhatsApp links are untouched by the base path", () => {
  const url = buildSendDealWhatsAppUrl("+62 813-0000-0000", {
    buyerName: "Andi",
    listingTitle: "Batubara Kalori 5800",
    quantity: "2000.000",
    price: "680000",
    paymentTerms: "Cash",
    transactionId: "tx-1",
  });

  assert.ok(url !== null);
  // wa.me is an external service: the marketplace subdirectory must never be
  // injected into it, or the deep link breaks.
  assert.ok(url.startsWith("https://wa.me/6281300000000?text="));
  assert.equal(url.includes(SUB), false);
  assert.equal(url.includes("ejs-coal"), false);
  assert.equal(url.includes("/offer/"), false);
  assert.equal(url.includes("/api/"), false);

  // The encoded message is a plain text body and must not gain a base path.
  const message = decodeURIComponent(url.split("?text=")[1]);
  assert.equal(message.includes(SUB), false);
  assert.ok(message.includes("Referensi Transaksi:\ntx-1"));
  assert.ok(message.includes("Batubara Kalori 5800"));
});
