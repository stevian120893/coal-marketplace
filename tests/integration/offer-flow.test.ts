import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { hashOfferToken } from "../../lib/offer-auth";
import { GET as offerGet } from "../../app/api/offer/[token]/route";
import { POST as quotePost } from "../../app/api/offer/[token]/quote/route";

/**
 * Integration tests for the buyer offer flow, driven against the real
 * PostgreSQL database and the real route handlers.
 *
 * Every row this suite creates uses the fixed TEST_* ids below and is removed
 * in teardown. The pre-existing seed data (2 users, 1 listing, 1 AccessToken,
 * 1 QuoteRequest) is snapshotted up front and asserted untouched afterwards:
 * the seed buyer magic link must stay valid and its QuoteRequest must not
 * vanish.
 */

const TEST_USER_ID = "test-offer-user";
const TEST_LISTING_ID = "test-offer-listing";
const TEST_DRAFT_LISTING_ID = "test-offer-draft-listing";
const TEST_SOLD_LISTING_ID = "test-offer-sold-listing";

function rawTokenFor(userId: string): string {
  // Unique per run so the AccessToken row below never collides.
  return `test-${userId}-${randomBytes(8).toString("hex")}`;
}

async function setup() {
  // Start from a clean slate for these exact test ids (idempotent re-runs).
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.coalListing.deleteMany({
    where: { id: { in: [TEST_LISTING_ID, TEST_DRAFT_LISTING_ID, TEST_SOLD_LISTING_ID] } },
  });

  const user = await prisma.user.create({
    data: {
      id: TEST_USER_ID,
      companyName: "Test Offer Co",
      name: "Test Buyer",
      phone: "+62 811 0000 0000",
      email: "test-offer@local.test",
      role: "BUYER",
      status: "ACTIVE",
    },
  });

  const listing = await prisma.coalListing.create({
    data: {
      id: TEST_LISTING_ID,
      title: "Test Spec Coal - 6,000 MT",
      description: "A listing for the automated offer tests.",
      category: "SPEC_COAL",
      coalType: null, // a SPEC_COAL lot is none of ASALAN/FINE/LAMPI
      typeLabel: "Spec 5600",
      origin: "Test Province",
      pricingMode: "NEGOTIABLE",
      // Legacy fixed columns exercised so the transitional read path is proven.
      gar: 5041,
      tm: 22,
      ash: 8.5,
      sulfur: 0.65,
      quantity: 6000,
      status: "PUBLISHED",
    },
  });

  // One flexible row that exists only in the flexible model.
  await prisma.coalSpecification.create({
    data: {
      coalListingId: listing.id,
      name: "HGI",
      value: "45",
      unit: null,
    },
  });

  // A DRAFT lot (invisible to buyers: 404 on the quote endpoint, absent from
  // the buyer page) and a SOLD lot (visible, but no longer available for
  // offers). Both are created buyer-visible-adjacent so the listing validation
  // path is exercised end to end.
  await prisma.coalListing.create({
    data: {
      id: TEST_DRAFT_LISTING_ID,
      title: "Test Offer Draft Lot",
      status: "DRAFT",
      quantity: 100,
    },
  });
  await prisma.coalListing.create({
    data: {
      id: TEST_SOLD_LISTING_ID,
      title: "Test Offer Sold Lot",
      category: "SPEC_COAL",
      coalType: "LAMPI",
      origin: "Test Province",
      pricingMode: "NEGOTIABLE",
      quantity: 500,
      status: "SOLD",
    },
  });

  // Media rows prove the buyer surface exposes asset locations and nothing else.
  await prisma.cOA.create({
    data: {
      coalListingId: listing.id,
      fileUrl: "https://cdn.local.test/coa/offer-coa.pdf",
    },
  });
  await prisma.coalPhoto.createMany({
    data: [
      { coalListingId: listing.id, fileUrl: "https://cdn.local.test/photos/offer-1.jpg" },
      { coalListingId: listing.id, fileUrl: "https://cdn.local.test/photos/offer-2.jpg" },
    ],
  });
  await prisma.coalVideo.create({
    data: {
      coalListingId: listing.id,
      fileUrl: "https://cdn.local.test/videos/offer-1.mp4",
    },
  });

  const rawToken = rawTokenFor(TEST_USER_ID);
  // Buyer-wide link: one token per buyer, no listing attached. The buyer picks
  // the listing at offer time.
  const access = await prisma.accessToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOfferToken(rawToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { user, listing, access, rawToken };
}

async function teardown() {
  await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  await prisma.coalListing.deleteMany({
    where: { id: { in: [TEST_LISTING_ID, TEST_DRAFT_LISTING_ID, TEST_SOLD_LISTING_ID] } },
  });
}

type Params = { params: Promise<{ token: string }> };

function ctx(token: string): Params {
  return { params: Promise.resolve({ token }) };
}

function postRequest(payload: unknown): Request {
  return new Request("http://localhost/api/offer/token/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

const VALID_OFFER = {
  listingId: TEST_LISTING_ID,
  quantity: 2000,
  offerPrice: 650000,
  paymentTerms: "Cash",
  notes: "Interested in physical inspection",
};

test("buyer offer flow against the real database", async () => {
  const countsBefore = {
    user: await prisma.user.count(),
    coalListing: await prisma.coalListing.count(),
    accessToken: await prisma.accessToken.count(),
    quoteRequest: await prisma.quoteRequest.count(),
    transaction: await prisma.transaction.count(),
  };

  const seedToken = await prisma.accessToken.findFirst({
    where: { userId: "seed-user-buyer" },
    select: { tokenHash: true, expiresAt: true, revokedAt: true },
  });
  const seedOffer = await prisma.quoteRequest.findFirst({
    where: { userId: "seed-user-buyer" },
  });
  assert.ok(seedToken !== null, "expected the seed buyer token to exist");
  assert.ok(seedOffer !== null, "expected the seed quote request to exist");

  const { user, rawToken } = await setup();
  try {
    await test("GET /api/offer/[token] returns the buyer and every buyer-visible listing", async () => {
      const response = await offerGet(new Request("http://localhost/"), ctx(rawToken));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        buyer: { companyName: string | null; name: string | null };
        listings: {
          id: string;
          title: string;
          description: string | null;
          category: string | null;
          coalType: string | null;
          typeLabel: string | null;
          pricingMode: string | null;
          quantity: string | null;
          status: string;
          specifications: { name: string; value: string; unit: string | null }[];
          photos: string[];
          coas: string[];
          videos: string[];
          price?: unknown;
        }[];
      };
      assert.equal(body.buyer.companyName, "Test Offer Co");
      assert.equal(body.buyer.name, "Test Buyer");

      // Buyer-visible set: the PUBLISHED lot plus SOLD (clearly marked). DRAFT
      // and unknown lots are structurally absent.
      const ids = body.listings.map((l) => l.id);
      assert.ok(ids.includes(TEST_LISTING_ID), "the PUBLISHED lot is listed");
      assert.ok(ids.includes(TEST_SOLD_LISTING_ID), "a SOLD lot stays visible");
      assert.equal(ids.includes(TEST_DRAFT_LISTING_ID), false, "DRAFT is never listed");

      const listingBody = body.listings.find((l) => l.id === TEST_LISTING_ID);
      assert.ok(listingBody !== undefined);
      assert.equal(listingBody.title, "Test Spec Coal - 6,000 MT");
      assert.equal(listingBody.category, "SPEC_COAL");
      assert.equal(listingBody.description, "A listing for the automated offer tests.");
      assert.equal(listingBody.coalType, null);
      assert.equal(listingBody.typeLabel, "Spec 5600");
      assert.equal(listingBody.pricingMode, "NEGOTIABLE");
      assert.equal(listingBody.quantity, "6000");
      assert.equal(listingBody.status, "PUBLISHED");
      const soldBody = body.listings.find((l) => l.id === TEST_SOLD_LISTING_ID);
      assert.ok(soldBody !== undefined);
      assert.equal(soldBody.status, "SOLD");
      // No public listing price is exposed, negotiable or otherwise.
      for (const l of body.listings) {
        assert.equal("price" in l, false);
        assert.equal("offerPrice" in l, false);
      }
      // Legacy columns merged in under the flexible model, then the explicit row.
      assert.deepEqual(listingBody.specifications, [
        { name: "GAR", value: "5041", unit: "kcal/kg" },
        { name: "TM", value: "22", unit: "%" },
        { name: "Ash", value: "8.5", unit: "%" },
        { name: "Sulfur", value: "0.65", unit: "%" },
        { name: "HGI", value: "45", unit: null },
      ]);
      // Media is exposed as asset locations only - no ids, no upload metadata.
      assert.deepEqual(listingBody.photos, [
        "https://cdn.local.test/photos/offer-1.jpg",
        "https://cdn.local.test/photos/offer-2.jpg",
      ]);
      assert.deepEqual(listingBody.coas, [
        "https://cdn.local.test/coa/offer-coa.pdf",
      ]);
      assert.deepEqual(listingBody.videos, [
        "https://cdn.local.test/videos/offer-1.mp4",
      ]);
      // The token hash must never appear in the response.
      assert.doesNotMatch(JSON.stringify(body), /[a-f0-9]{64}/);
    });

    await test("GET /api/offer/[token] returns 401 for an unknown token", async () => {
      const response = await offerGet(
        new Request("http://localhost/"),
        ctx("definitely-not-a-real-token"),
      );
      assert.equal(response.status, 401);
    });

    await test("an expired token is rejected on read and on submit", async () => {
      const expiredRaw = rawTokenFor(`${TEST_USER_ID}-expired`);
      await prisma.accessToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOfferToken(expiredRaw),
          expiresAt: new Date(Date.now() - 60 * 1000),
        },
      });
      const getResponse = await offerGet(
        new Request("http://localhost/"),
        ctx(expiredRaw),
      );
      assert.equal(getResponse.status, 401);
      const postResponse = await quotePost(postRequest(VALID_OFFER), ctx(expiredRaw));
      assert.equal(postResponse.status, 401);
    });

    await test("the <slug>-<secret> link format works, and only the secret authenticates", async () => {
      // A modern buyer-wide link: https://<domain>/offer/andi-prasetyo-<secret>.
      const secret = randomBytes(32).toString("base64url");
      assert.equal(secret.length, 43, "the fixed-length secret is 43 base64url chars");
      await prisma.accessToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOfferToken(secret),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const withSlug = await offerGet(
        new Request("http://localhost/"),
        ctx(`andi-prasetyo-${secret}`),
      );
      assert.equal(withSlug.status, 200, "the slug-secret link resolves");

      // The slug is informational: a wrong slug with the right secret still
      // authenticates (by design), a wrong secret authenticates nothing.
      const wrongSlug = await offerGet(
        new Request("http://localhost/"),
        ctx(`someone-else-${secret}`),
      );
      assert.equal(wrongSlug.status, 200, "the slug never participates in auth");

      const wrongSecret = await offerGet(
        new Request("http://localhost/"),
        ctx(`andi-prasetyo-${"z".repeat(43)}`),
      );
      assert.equal(wrongSecret.status, 401, "a wrong secret is rejected");

      // A bare 43-char legacy raw token still resolves (no slug in the URL).
      const bareLegacy = await offerGet(
        new Request("http://localhost/"),
        ctx(secret),
      );
      assert.equal(bareLegacy.status, 200, "legacy bare raw token keeps working");

      // Revocation invalidates the link on both formats.
      const revoked = secret.split("").reverse().join("").slice(0, 20) + secret.slice(20);
      await prisma.accessToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOfferToken(revoked),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revokedAt: new Date(),
        },
      });
      const revokedResponse = await offerGet(
        new Request("http://localhost/"),
        ctx(`revoked-buyer-${revoked}`),
      );
      assert.equal(revokedResponse.status, 401, "a revoked token is rejected");
    });

    await test("a valid offer is created as PENDING with the buyer's chosen listing", async () => {
      const response = await quotePost(postRequest(VALID_OFFER), ctx(rawToken));
      const rawBody = await response.json().catch(() => null);
      assert.equal(response.status, 201, JSON.stringify(rawBody));
      const created = rawBody as {
        quoteRequest: { id: string; status: string; offerPrice: string | null };
      };
      assert.equal(created.quoteRequest.status, "PENDING");
      assert.equal(Number(created.quoteRequest.offerPrice), 650000);

      const row = await prisma.quoteRequest.findUnique({
        where: { id: created.quoteRequest.id },
        select: {
          id: true,
          userId: true,
          coalListingId: true,
          quantity: true,
          offerPrice: true,
          paymentTerms: true,
          notes: true,
          status: true,
        },
      });
      assert.ok(row !== null);
      // Server-controlled identity comes from the AccessToken, never the body;
      // the listing comes from the buyer's validated pick (listingId).
      assert.equal(row.userId, TEST_USER_ID);
      assert.equal(row.coalListingId, TEST_LISTING_ID);
      assert.equal(Number(row.quantity), 2000);
      assert.equal(Number(row.offerPrice), 650000);
      assert.equal(row.status, "PENDING");
      assert.equal(row.paymentTerms, "Cash");
      assert.equal(row.notes, "Interested in physical inspection");
    });

    await test("validation is enforced end to end", async () => {
      const cases: { name: string; payload: unknown }[] = [
        {
          name: "missing listingId",
          payload: {
            quantity: 2000,
            offerPrice: 650000,
            paymentTerms: "Cash",
            notes: null,
          },
        },
        { name: "quantity <= 0", payload: { ...VALID_OFFER, quantity: 0 } },
        { name: "quantity negative", payload: { ...VALID_OFFER, quantity: -100 } },
        {
          name: "quantity above available",
          payload: { ...VALID_OFFER, quantity: 6001 },
        },
        {
          name: "missing offerPrice",
          payload: {
            listingId: TEST_LISTING_ID,
            quantity: 2000,
            paymentTerms: "Cash",
            notes: null,
          },
        },
        { name: "offerPrice <= 0", payload: { ...VALID_OFFER, offerPrice: 0 } },
        { name: "offerPrice negative", payload: { ...VALID_OFFER, offerPrice: -1 } },
        { name: "paymentTerms not a string", payload: { ...VALID_OFFER, paymentTerms: 42 } },
        { name: "notes not a string", payload: { ...VALID_OFFER, notes: ["nope"] } },
        {
          name: "offerPrice too many decimals",
          payload: { ...VALID_OFFER, offerPrice: 650000.005 },
        },
        { name: "userId spoof", payload: { ...VALID_OFFER, userId: "attacker" } },
        { name: "status spoof", payload: { ...VALID_OFFER, status: "ACCEPTED" } },
        { name: "transactionId spoof", payload: { ...VALID_OFFER, transactionId: "tx-1" } },
        { name: "malformed JSON", payload: "{ this is not json" },
      ];

      for (const c of cases) {
        const response = await quotePost(postRequest(c.payload), ctx(rawToken));
        assert.equal(
          response.status,
          400,
          `${c.name}: expected 400, got ${response.status}`,
        );
        const body = (await response.json()) as { error?: unknown };
        assert.equal(typeof body.error, "string", `${c.name}: error must be a string`);
      }
    });

    await test("the picked listing is validated server-side before an offer is stored", async () => {
      // Unknown listing: same as a listing that does not exist publicly -> 404.
      const unknown = await quotePost(
        postRequest({ ...VALID_OFFER, listingId: "no-such-listing" }),
        ctx(rawToken),
      );
      assert.equal(unknown.status, 404);

      // DRAFT lots do not exist publicly -> 404, and nothing is stored.
      const draft = await quotePost(
        postRequest({ ...VALID_OFFER, listingId: TEST_DRAFT_LISTING_ID }),
        ctx(rawToken),
      );
      assert.equal(draft.status, 404);
      assert.equal(
        await prisma.quoteRequest.count({
          where: { coalListingId: TEST_DRAFT_LISTING_ID },
        }),
        0,
        "no offer may attach to a DRAFT lot",
      );

      // SOLD lots stay visible but are no longer available for offers -> 400.
      const sold = await quotePost(
        postRequest({ ...VALID_OFFER, listingId: TEST_SOLD_LISTING_ID }),
        ctx(rawToken),
      );
      assert.equal(sold.status, 400);
      const soldBody = (await sold.json()) as { error?: string };
      assert.equal(
        soldBody.error,
        "Listing ini sedang tidak tersedia untuk penawaran.",
      );

      // A quantity that exceeds the picked listing's available amount -> 400.
      const over = await quotePost(
        postRequest({ ...VALID_OFFER, listingId: TEST_LISTING_ID, quantity: 6001 }),
        ctx(rawToken),
      );
      assert.equal(over.status, 400);
    });

    await test("seed buyer token and quote request are untouched", async () => {
      const afterToken = await prisma.accessToken.findFirst({
        where: { userId: "seed-user-buyer" },
        select: { tokenHash: true, expiresAt: true, revokedAt: true },
      });
      const afterOffer = await prisma.quoteRequest.findFirst({
        where: { userId: "seed-user-buyer" },
      });
      assert.deepEqual(afterToken, seedToken);
      assert.ok(afterOffer !== null);
      // The existing quote request survives with its values intact.
      assert.equal(afterOffer.id, seedOffer!.id);
      assert.equal(afterOffer.status, "PENDING");
      assert.equal(Number(afterOffer.quantity), 1500);
      assert.equal(afterOffer.offerPrice, null);
      assert.equal(afterOffer.paymentTerms, "LC at sight");
    });
  } finally {
    await teardown();
    const countsAfter = {
      user: await prisma.user.count(),
      coalListing: await prisma.coalListing.count(),
      accessToken: await prisma.accessToken.count(),
      quoteRequest: await prisma.quoteRequest.count(),
      transaction: await prisma.transaction.count(),
    };
    assert.deepEqual(countsAfter, countsBefore, "test data must be fully removed");
  }
});