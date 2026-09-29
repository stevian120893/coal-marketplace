import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import { hashSessionToken } from "../../lib/admin/session";
import { hashOfferToken } from "../../lib/offer-auth";
import { GET as listingsGet } from "../../app/api/listings/route";
import { GET as listingDetailGet } from "../../app/api/listings/[id]/route";
import { GET as offersGet } from "../../app/api/offer/[token]/route";
import { POST as quotePost } from "../../app/api/offer/[token]/quote/route";
import { GET as dealsGet } from "../../app/api/offer/[token]/deals/route";
import { GET as adminOffersListGet } from "../../app/api/admin/quote-requests/route";
import {
  GET as adminOfferDetailGet,
  PATCH as adminStatusPatch,
} from "../../app/api/admin/quote-requests/[id]/route";
import { POST as adminTransactionPost } from "../../app/api/admin/quote-requests/[id]/transaction/route";
import { GET as adminBuyerDetailGet } from "../../app/api/admin/buyers/[id]/route";

/**
 * Buyer privacy integration test.
 *
 * Two buyers, A and B, both have a link to the SAME listing. Each submits an
 * offer; A's offer reaches a final Transaction. The rules verified here:
 *
 *   - the public catalog and detail endpoints expose listing facts only -
 *     no Buyer Offer price, no Transaction price, no buyer identity;
 *   - each buyer's /deals view shows exactly their own offers and (for A) their
 *     own Transaction price; B can never read A's rows through the same
 *     listing link, and neither can reach the other via the URL;
 *   - the admin sees both buyers, both offers, and the Transaction price.
 *
 * Test rows carry fixed privacy-* ids and are removed in teardown; seed rows
 * are only read.
 */

const PRIVACY_ADMIN_ID = "privacy-admin";
const PRIVACY_BUYER_A = "privacy-buyer-a";
const PRIVACY_BUYER_B = "privacy-buyer-b";
const PRIVACY_LISTING_ID = "privacy-listing";
const PRIVACY_LISTING_2_ID = "privacy-listing-2";
const PRIVACY_DRAFT_LISTING_ID = "privacy-draft-listing";

function adminApiRequest(cookieValue: string | undefined): NextRequest {
  const fake = {
    nextUrl: new URL("http://localhost/api/admin/quote-requests"),
    cookies: {
      get: (name: string) =>
        cookieValue === undefined ? undefined : { name, value: cookieValue },
    },
  };
  return fake as unknown as NextRequest;
}

function adminPatchRequest(
  cookieValue: string,
  json: () => Promise<unknown>,
): NextRequest {
  const fake = {
    nextUrl: new URL("http://localhost/api/admin/quote-requests/id"),
    cookies: {
      get: (name: string) => ({ name, value: cookieValue }),
    },
    json,
  };
  return fake as unknown as NextRequest;
}

function offerCtx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

type TokenParams = { params: Promise<{ token: string }> };

function tokenCtx(token: string): TokenParams {
  return { params: Promise.resolve({ token }) };
}

/** Plain Requests for routes that declare a NextRequest but never read it. */
function plainNextRequest(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

async function setup() {
  const userIds = [PRIVACY_ADMIN_ID, PRIVACY_BUYER_A, PRIVACY_BUYER_B];
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.coalListing.deleteMany({
    where: { id: { in: [PRIVACY_LISTING_ID, PRIVACY_LISTING_2_ID, PRIVACY_DRAFT_LISTING_ID] } },
  });

  await prisma.user.create({
    data: {
      id: PRIVACY_ADMIN_ID,
      email: "privacy-admin@local.test",
      name: "Privacy Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const buyerA = await prisma.user.create({
    data: {
      id: PRIVACY_BUYER_A,
      companyName: "Privacy Buyer A",
      name: "Buyer A Person",
      email: "privacy-a@local.test",
      role: "BUYER",
      status: "ACTIVE",
    },
  });
  const buyerB = await prisma.user.create({
    data: {
      id: PRIVACY_BUYER_B,
      companyName: "Privacy Buyer B",
      name: "Buyer B Person",
      email: "privacy-b@local.test",
      role: "BUYER",
      status: "ACTIVE",
    },
  });

  const listing = await prisma.coalListing.create({
    data: {
      id: PRIVACY_LISTING_ID,
      title: "Shared Privacy Lot 5,000 kcal/kg",
      category: "SPEC_COAL",
      coalType: "ASALAN",
      origin: "Lampung",
      pricingMode: "NEGOTIABLE",
      quantity: 5000,
      status: "PUBLISHED",
    },
  });
  await prisma.coalSpecification.createMany({
    data: [
      { coalListingId: listing.id, name: "GAR", value: "5041", unit: "kcal/kg" },
      { coalListingId: listing.id, name: "TM", value: "25", unit: "%" },
    ],
  });
  // A second published lot of a different coal type: the same buyer-wide link
  // must surface EVERY published listing, and the buyer picks which one to
  // make an offer on.
  await prisma.coalListing.create({
    data: {
      id: PRIVACY_LISTING_2_ID,
      title: "Shared Privacy FINE Lot 5,500 kcal/kg",
      category: "SPEC_COAL",
      coalType: "FINE",
      origin: "Kalimantan",
      pricingMode: "NEGOTIABLE",
      quantity: 3000,
      status: "PUBLISHED",
    },
  });
  // DRAFT lots must never appear in the public catalog.
  await prisma.coalListing.create({
    data: {
      id: PRIVACY_DRAFT_LISTING_ID,
      title: "Hidden Draft Privacy Lot",
      status: "DRAFT",
    },
  });

  const rawSession = randomBytes(32).toString("base64url");
  await prisma.adminSession.create({
    data: {
      userId: PRIVACY_ADMIN_ID,
      tokenHash: hashSessionToken(rawSession),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const rawA = `privacy-a-${randomBytes(8).toString("hex")}`;
  const rawB = `privacy-b-${randomBytes(8).toString("hex")}`;
  // Buyer-wide links: one token per buyer, no listing attached. The buyer
  // chooses the listing on the offer page.
  await prisma.accessToken.create({
    data: {
      userId: buyerA.id,
      tokenHash: hashOfferToken(rawA),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.accessToken.create({
    data: {
      userId: buyerB.id,
      tokenHash: hashOfferToken(rawB),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { buyerA, buyerB, listing, rawSession, rawA, rawB };
}

async function teardown() {
  await prisma.user.deleteMany({
    where: { id: { in: [PRIVACY_ADMIN_ID, PRIVACY_BUYER_A, PRIVACY_BUYER_B] } },
  });
  await prisma.coalListing.deleteMany({
    where: { id: { in: [PRIVACY_LISTING_ID, PRIVACY_LISTING_2_ID, PRIVACY_DRAFT_LISTING_ID] } },
  });
}

async function countsSnapshot() {
  return {
    user: await prisma.user.count(),
    coalListing: await prisma.coalListing.count(),
    accessToken: await prisma.accessToken.count(),
    quoteRequest: await prisma.quoteRequest.count(),
    transaction: await prisma.transaction.count(),
    coalSpecification: await prisma.coalSpecification.count(),
    coalVideo: await prisma.coalVideo.count(),
    coalPhoto: await prisma.coalPhoto.count(),
    cOA: await prisma.cOA.count(),
    adminSession: await prisma.adminSession.count(),
  };
}

/** Submits an offer as the given raw token; returns the offer id. */
async function submitPurchaseOffer(
  rawToken: string,
  offerPrice: number,
  listingId: string = PRIVACY_LISTING_ID,
): Promise<string> {
  const response = await quotePost(
    new Request("http://localhost/api/offer/t/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingId,
        quantity: 2000,
        offerPrice,
        paymentTerms: "TT after inspection",
        notes: "Privacy flow test",
      }),
    }),
    { params: Promise.resolve({ token: rawToken }) },
  );
  const body = (await response.json().catch(() => null)) as {
    quoteRequest?: { id: string };
    error?: string;
  } | null;
  assert.equal(
    response.status,
    201,
    body === null ? "response body was not JSON" : JSON.stringify(body),
  );
  if (body === null || body.quoteRequest === undefined) {
    assert.fail("successful offer is missing its quoteRequest id");
  }
  return body.quoteRequest.id;
}

test("buyer privacy: A and B never see each other's prices", async () => {
  const countsBefore = await countsSnapshot();
  const { buyerA, buyerB, rawSession, rawA, rawB } = await setup();

  let offerAId = "";
  let offerBId = "";

  try {
    await test("the public catalog exposes listing facts only, never prices or identities", async () => {
      const response = await listingsGet();
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        listings: { id: string; title: string; status: string }[];
      };

      const shared = body.listings.find((l) => l.id === PRIVACY_LISTING_ID);
      assert.ok(shared !== undefined, "the PUBLISHED shared lot is listed");
      assert.equal(shared.status, "PUBLISHED");
      assert.equal(
        body.listings.some((l) => l.id === PRIVACY_DRAFT_LISTING_ID),
        false,
        "DRAFT lots are not in the public catalog",
      );

      const serialized = JSON.stringify(body);
      assert.doesNotMatch(serialized, /offerPrice/i);
      assert.doesNotMatch(serialized, /"price"/i);
      assert.doesNotMatch(serialized, /Privacy Buyer A/i);
      assert.doesNotMatch(serialized, /Privacy Buyer B/i);
    });

    await test("the public detail endpoint never discloses a price or buyer", async () => {
      const response = await listingDetailGet(
        plainNextRequest("http://localhost/api/listings/x"),
        offerCtx(PRIVACY_LISTING_ID),
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as { listing: Record<string, unknown> };
      const keys = Object.keys(body.listing);
      for (const forbidden of ["price", "offerPrice", "buyer", "userId", "transaction"]) {
        assert.equal(keys.includes(forbidden), false, `detail must not expose ${forbidden}`);
      }
      assert.deepEqual(body.listing.specifications, [
        { name: "GAR", value: "5041", unit: "kcal/kg" },
        { name: "TM", value: "25", unit: "%" },
      ]);

      const draft = await listingDetailGet(
        plainNextRequest("http://localhost/api/listings/x"),
        offerCtx(PRIVACY_DRAFT_LISTING_ID),
      );
      assert.equal(draft.status, 404, "a DRAFT lot does not exist publicly");
    });

    await test("both buyers submit offers on the same listing", async () => {
      offerAId = await submitPurchaseOffer(rawA, 650000);
      offerBId = await submitPurchaseOffer(rawB, 720000);
      assert.notEqual(offerAId, offerBId);
    });

    await test("a buyer-wide link reaches every published listing, and the buyer picks freely", async () => {
      // A's single link is not tied to one lot: A can make an offer on the
      // second (FINE) listing too, and the offer is recorded against it.
      const offerId = await submitPurchaseOffer(rawA, 640000, PRIVACY_LISTING_2_ID);
      const row = await prisma.quoteRequest.findUniqueOrThrow({
        where: { id: offerId },
        select: { userId: true, coalListingId: true },
      });
      assert.equal(row.userId, PRIVACY_BUYER_A);
      assert.equal(row.coalListingId, PRIVACY_LISTING_2_ID);
    });

    await test("A's deal: a finalized offer becomes A's own Transaction", async () => {
      // Open negotiation, then "Finalisasi Kesepakatan": both through the real
      // APIs. The finalization POST is what marks the offer Disepakati.
      const negotiate = await adminStatusPatch(
        adminPatchRequest(rawSession, async () => ({ status: "IN_NEGOTIATION" })),
        offerCtx(offerAId),
      );
      assert.equal(negotiate.status, 200);

      const deal = await adminTransactionPost(
        adminPatchRequest(rawSession, async () => ({
          quantity: 2000,
          price: 680000,
          paymentTerms: "TT after inspection",
        })),
        offerCtx(offerAId),
      );
      assert.equal(deal.status, 201);

      const tx = await prisma.transaction.findFirstOrThrow({
        where: { quoteRequestId: offerAId },
      });
      assert.equal(Number(tx.price), 680000);
      assert.equal(Number(tx.quantity), 2000);
      assert.equal(tx.status, "CONFIRMED");
      assert.equal(tx.userId, PRIVACY_BUYER_A);
      assert.equal(tx.coalListingId, PRIVACY_LISTING_ID);
    });

    await test("Buyer A sees their own offer and Transaction price; never B's", async () => {
      const response = await dealsGet(
        new Request("http://localhost/api/offer/t/deals"),
        tokenCtx(rawA),
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        offers: { offerPrice: string | null; quantity: string }[];
        transaction: { price: string; status: string } | null;
      };

      assert.ok(body.offers.length >= 1);
      const own = body.offers.find((offer) => offer.offerPrice === "650000");
      assert.ok(own !== undefined, "A sees their own offer price");

      const serialized = JSON.stringify(body);
      assert.ok(!serialized.includes("720000"), "A must never see B's offer price");
      assert.ok(body.transaction !== null, "A sees their deal");
      assert.equal(body.transaction.price, "680000");
    });

    await test("Buyer B sees only their own offer and never A's transaction", async () => {
      const response = await dealsGet(
        new Request("http://localhost/api/offer/t/deals"),
        tokenCtx(rawB),
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        offers: { offerPrice: string | null }[];
        transaction: { price: string } | null;
      };

      assert.equal(body.transaction, null, "B has no deal and must not see A's");
      const serialized = JSON.stringify(body);
      assert.ok(!serialized.includes("650000"), "B must never see A's offer price");
      assert.ok(!serialized.includes("680000"), "B must never see A's Transaction price");
      assert.ok(body.offers.some((offer) => offer.offerPrice === "720000"));
    });

    await test("a token cannot be swapped to reach another buyer's deal", async () => {
      // A forged/unknown token is 401 on both the offer and deals endpoints.
      const bogus = await dealsGet(
        new Request("http://localhost/api/offer/t/deals"),
        tokenCtx("privacy-b-0000000000000000"),
      );
      assert.equal(bogus.status, 401);

      // A's token cannot be renamed to B's buyer in any request: identity is
      // derived from the token alone, so there is no parameter to change.
      const bodySpoof = await quotePost(
        new Request("http://localhost/api/offer/t/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            listingId: PRIVACY_LISTING_ID,
            quantity: 1,
            offerPrice: 1,
            userId: PRIVACY_BUYER_B, // attempted spoof
          }),
        }),
        { params: Promise.resolve({ token: rawA }) },
      );
      assert.equal(bodySpoof.status, 400); // coerced identity is structurally impossible
      const created = await prisma.quoteRequest.findMany({
        where: { userId: PRIVACY_BUYER_B, coalListingId: PRIVACY_LISTING_ID },
        select: { offerPrice: true },
      });
      assert.ok(
        created.every((offer) => Number(offer.offerPrice) !== 1),
        "a spoofed userId never attaches an offer to the other buyer",
      );
    });

    await test("the admin sees both buyers, both offers, and the transaction", async () => {
      const list = await adminOffersListGet(adminApiRequest(rawSession));
      assert.equal(list.status, 200);
      const listBody = (await list.json()) as {
        quoteRequests: { id: string; offerPrice: string | null }[];
        transaction?: unknown;
      };
      const ids = listBody.quoteRequests.map((row) => row.id);
      assert.ok(ids.includes(offerAId), "admin sees offer A");
      assert.ok(ids.includes(offerBId), "admin sees offer B");

      // Admin detail for A's offer shows both the offer price and the deal.
      const detail = await adminOfferDetailGet(adminApiRequest(rawSession), offerCtx(offerAId));
      assert.equal(detail.status, 200);
      const rowA = (await detail.json()) as {
        quoteRequest: {
          offerPrice: string | null;
          buyer: { companyName: string | null };
          transaction: { price: string; status: string } | null;
        };
      };
      assert.equal(Number(rowA.quoteRequest.offerPrice), 650000);
      assert.equal(rowA.quoteRequest.buyer.companyName, "Privacy Buyer A");
      assert.equal(rowA.quoteRequest.transaction?.price, "680000");

      // The admin buyer insight: A has a transaction, B does not.
      const buyerAProfile = await adminBuyerDetailGet(
        adminApiRequest(rawSession),
        offerCtx(buyerA.id),
      );
      const buyerBProfile = await adminBuyerDetailGet(
        adminApiRequest(rawSession),
        offerCtx(buyerB.id),
      );
      const profileA = (await buyerAProfile.json()) as { buyer: { transactionCount: number } };
      const profileB = (await buyerBProfile.json()) as { buyer: { transactionCount: number } };
      assert.equal(profileA.buyer.transactionCount, 1);
      assert.equal(profileB.buyer.transactionCount, 0);
    });

    await test("the offer page endpoint returns buyer-visible listings only - facts, never prices", async () => {
      // The personalized offer view for the same buyer-wide link exposes all
      // published listings (with their facts) and no prices at all - for A and
      // B alike. DRAFT lots never appear; there is no buyer or price data.
      for (const raw of [rawA, rawB]) {
        const response = await offersGet(
          new Request("http://localhost/api/offer/t"),
          tokenCtx(raw),
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          buyer: { companyName: string | null; name: string | null };
          listings: Record<string, unknown>[];
        };
        assert.ok(body.buyer !== undefined, "the buyer identity is present");
        const ids = body.listings.map((l) => l.id);
        assert.ok(ids.includes(PRIVACY_LISTING_ID), "the ASALAN lot is listed");
        assert.ok(ids.includes(PRIVACY_LISTING_2_ID), "the FINE lot is listed");
        assert.equal(ids.includes(PRIVACY_DRAFT_LISTING_ID), false, "DRAFT is never listed");

        const serialized = JSON.stringify(body.listings);
        assert.doesNotMatch(serialized, /offerPrice/i);
        assert.doesNotMatch(serialized, /"price"/i);
        assert.ok(!serialized.includes("650000"), "no offer price leaks");
        assert.ok(!serialized.includes("720000"), "no offer price leaks");
      }
    });
  } finally {
    await teardown();
    const countsAfter = await countsSnapshot();
    assert.deepEqual(countsAfter, countsBefore, "test data must be fully removed");
  }
});