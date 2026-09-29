import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import {
  authenticateAdminSession,
  authorizeAdminRequest,
} from "../../lib/admin/authorize";
import { hashSessionToken } from "../../lib/admin/session";
import { hashOfferToken } from "../../lib/offer-auth";
import { GET as adminListGet } from "../../app/api/admin/quote-requests/route";
import {
  GET as adminDetailGet,
  PATCH as adminStatusPatch,
} from "../../app/api/admin/quote-requests/[id]/route";
import { POST as adminTransactionPost } from "../../app/api/admin/quote-requests/[id]/transaction/route";
import { POST as quotePost } from "../../app/api/offer/[token]/quote/route";
import { buildSendDealWhatsAppUrl } from "../../lib/whatsapp";

/**
 * Integration tests for the buyer offer management flow.
 *
 * Covers the admin read endpoints plus the new status-update endpoint: the
 * session stays hashed, authorisation is centralised, a status update can only
 * change `status` (never the buyer's proposal or identity, and never creates a
 * Transaction), and accepted/rejected/cancelled offers are terminal.
 *
 * Test rows carry fixed TEST_* ids and are removed in teardown; seed rows are
 * only read.
 */

const TEST_ADMIN_ID = "test-admin-user";
const TEST_ADMIN_EMAIL = "test-admin@local.test";
const TEST_BUYER_ID = "test-admin-buyer";
const TEST_LISTING_ID = "test-admin-listing";
const TEST_INACTIVE_ADMIN_ID = "test-admin-inactive";

const BUYER_OFFER_PAYLOAD = {
  listingId: TEST_LISTING_ID,
  quantity: 2000,
  offerPrice: 650000,
  paymentTerms: "Cash",
  notes: "Negotiation flow test",
};

/** Minimal stand-in for NextRequest covering what the admin routes read. */
function adminApiRequest(
  cookieValue: string | undefined,
  statusParam?: string | null,
): NextRequest {
  const url = new URL(
    `http://localhost/api/admin/quote-requests${
      statusParam === undefined ? "" : `?status=${statusParam}`
    }`,
  );
  const fake = {
    nextUrl: url,
    cookies: {
      get: (name: string) =>
        cookieValue === undefined ? undefined : { name, value: cookieValue },
    },
  };
  return fake as unknown as NextRequest;
}

/** Stand-in for the PATCH route: adds the json() the status handler reads. */
function adminPatchRequest(
  cookieValue: string | undefined,
  json: () => Promise<unknown>,
): NextRequest {
  const fake = {
    nextUrl: new URL("http://localhost/api/admin/quote-requests/test-id"),
    cookies: {
      get: (name: string) =>
        cookieValue === undefined ? undefined : { name, value: cookieValue },
    },
    json,
  };
  return fake as unknown as NextRequest;
}

function offerCtx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function setup() {
  await prisma.user.deleteMany({ where: { id: TEST_ADMIN_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_BUYER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_INACTIVE_ADMIN_ID } });
  await prisma.coalListing.deleteMany({ where: { id: TEST_LISTING_ID } });

  const admin = await prisma.user.create({
    data: {
      id: TEST_ADMIN_ID,
      email: TEST_ADMIN_EMAIL,
      name: "Test Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const buyer = await prisma.user.create({
    data: {
      id: TEST_BUYER_ID,
      companyName: "Admin Flow Buyer",
      name: "Buyer Person",
      phone: "+62 813 0000 0000",
      email: "test-admin-buyer@local.test",
      role: "BUYER",
      status: "ACTIVE",
    },
  });

  const listing = await prisma.coalListing.create({
    data: {
      id: TEST_LISTING_ID,
      title: "Admin Flow Lot",
      category: "LOW_NO_SPEC",
      coalType: "ASALAN",
      origin: "Lampung",
      pricingMode: "NEGOTIABLE",
      quantity: 5000,
      status: "PUBLISHED",
    },
  });

  await prisma.coalSpecification.createMany({
    data: [
      { coalListingId: listing.id, name: "GAR", value: "5100", unit: "kcal/kg" },
      { coalListingId: listing.id, name: "TM", value: "25", unit: "%" },
    ],
  });

  // A real ADMIN account that is INACTIVE: every admin API must reject it.
  const inactiveAdmin = await prisma.user.create({
    data: {
      id: TEST_INACTIVE_ADMIN_ID,
      email: "test-inactive@local.test",
      name: "Inactive Admin",
      role: "ADMIN",
      status: "INACTIVE",
    },
  });

  return { admin, buyer, listing, inactiveAdmin };
}

async function teardown() {
  await prisma.user.deleteMany({ where: { id: TEST_ADMIN_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_BUYER_ID } });
  await prisma.user.deleteMany({ where: { id: TEST_INACTIVE_ADMIN_ID } });
  await prisma.coalListing.deleteMany({ where: { id: TEST_LISTING_ID } });
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

test("admin console flow against the real database", async () => {
  const countsBefore = await countsSnapshot();
  const transactionCountBefore = countsBefore.transaction;

  const { buyer, inactiveAdmin } = await setup();
  const rawSessionToken = randomBytes(32).toString("base64url");
  const adminRow = await prisma.user.findUniqueOrThrow({ where: { id: TEST_ADMIN_ID } });

  // Buyer magic link used by the tests that create real offers end to end.
  const buyerAccessRaw = `test-admin-buyer-access-${randomBytes(8).toString("hex")}`;
  // A real ADMIN session belonging to the INACTIVE account (for the 403 case).
  const inactiveAdminRaw = `test-inactive-${randomBytes(8).toString("hex")}`;

  /** Submits a valid offer through the real buyer endpoint; returns its id. */
  async function createBuyerOffer(
    payload: Record<string, unknown> = BUYER_OFFER_PAYLOAD,
  ): Promise<string> {
    const response = await quotePost(
      new Request("http://localhost/api/offer/t/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ token: buyerAccessRaw }) },
    );
    const rawBody = await response.json().catch(() => null);
    assert.equal(response.status, 201, JSON.stringify(rawBody));
    const body = rawBody as { quoteRequest: { id: string; status: string } };
    assert.equal(body.quoteRequest.status, "PENDING");
    return body.quoteRequest.id;
  }

    /**
     * Opens negotiation on an offer, the first half of the deal: PENDING ->
     * IN_NEGOTIATION through the real status endpoint.
     */
    async function startNegotiation(offerId: string): Promise<void> {
      const response = await adminStatusPatch(
        adminPatchRequest(rawSessionToken, async () => ({ status: "IN_NEGOTIATION" })),
        offerCtx(offerId),
      );
      assert.equal(response.status, 200);
    }

    /** The agreed final terms the admin types into "Finalisasi Kesepakatan". */
    const FINAL_DEAL_PAYLOAD = async () => ({
      quantity: 2000,
      price: 680000,
      paymentTerms: "Cash",
    });

    /** Posts "Finalisasi Kesepakatan" against the real finalization endpoint. */
    async function finalizeDeal(
      offerId: string,
      json: () => Promise<unknown> = FINAL_DEAL_PAYLOAD,
    ): Promise<Response> {
      return adminTransactionPost(adminPatchRequest(rawSessionToken, json), offerCtx(offerId));
    }

  try {
    // Create both extra sessions before any nested test runs.
    await prisma.adminSession.create({
      data: {
        userId: adminRow.id,
        tokenHash: hashSessionToken(rawSessionToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true, tokenHash: true },
    });
    await prisma.adminSession.create({
      data: {
        userId: inactiveAdmin.id,
        tokenHash: hashSessionToken(inactiveAdminRaw),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    await prisma.accessToken.create({
      data: {
        userId: buyer.id,
        tokenHash: hashOfferToken(buyerAccessRaw),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await test("authenticateAdminSession accepts the hashed session token", async () => {
      const auth = await authenticateAdminSession(rawSessionToken);
      assert.equal(auth.ok, true);
      if (auth.ok) {
        assert.equal(auth.admin.id, TEST_ADMIN_ID);
        assert.equal(auth.admin.email, TEST_ADMIN_EMAIL);
      }
    });

    await test("authorizeAdminRequest is centralised and rejects missing sessions", async () => {
      const ok = await authorizeAdminRequest(adminApiRequest(rawSessionToken));
      assert.equal(ok.ok, true);
      const missing = await authorizeAdminRequest(adminApiRequest(undefined));
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.equal(missing.status, 401);
      const garbage = await authorizeAdminRequest(adminApiRequest("not-a-real-token"));
      assert.equal(garbage.ok, false);
    });

    await test("GET /api/admin/quote-requests lists the existing offer without leaks", async () => {
      const response = await adminListGet(adminApiRequest(rawSessionToken));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        quoteRequests: {
          id: string;
          status: string;
          quantity: string;
          offerPrice: string | null;
          paymentTerms: string | null;
          buyer: { companyName: string | null };
          coalListing: { id: string; title: string };
        }[];
      };
      // The existing seed quote request is surfaced, pre-model offerPrice null.
      const seed = body.quoteRequests.find((row) => row.id.startsWith("cmul"));
      assert.ok(seed !== undefined, "expected the existing quote request in the list");
      assert.equal(seed.status, "PENDING");
      assert.equal(seed.quantity, "1500");
      assert.equal(seed.offerPrice, null);
      assert.equal(seed.paymentTerms, "LC at sight");
      const serialized = JSON.stringify(body);
      // No access-token hash, no session hash, no raw secret anywhere.
      assert.doesNotMatch(serialized, /[a-f0-9]{64}/);
      assert.doesNotMatch(serialized, /tokenHash/);
      assert.doesNotMatch(serialized, /admin_session/);
    });

    await test("GET /api/admin/quote-requests requires auth and rejects bad filters", async () => {
      const unauthenticated = await adminListGet(adminApiRequest(undefined));
      assert.equal(unauthenticated.status, 401);
      const badFilter = await adminListGet(adminApiRequest(rawSessionToken, "QUOTED"));
      assert.equal(badFilter.status, 400);
    });

    await test("buyer offer -> admin detail shows the offer price and specs", async () => {
      const buyerRow = await prisma.user.findUniqueOrThrow({ where: { id: TEST_BUYER_ID } });
      const rawToken = `test-admin-${randomBytes(8).toString("hex")}`;
      await prisma.accessToken.create({
        data: {
          userId: buyerRow.id,
          tokenHash: hashOfferToken(rawToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const postResponse = await quotePost(
        new Request("http://localhost/api/offer/t/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            listingId: TEST_LISTING_ID,
            quantity: 3000,
            offerPrice: 680000,
            paymentTerms: "TT after inspection",
            notes: "Deliver to Lampung port",
          }),
        }),
        { params: Promise.resolve({ token: rawToken }) },
      );
      assert.equal(postResponse.status, 201);
      const posted = (await postResponse.json()) as {
        quoteRequest: { id: string };
      };

      const detailResponse = await adminDetailGet(
        adminApiRequest(rawSessionToken),
        offerCtx(posted.quoteRequest.id),
      );
      assert.equal(detailResponse.status, 200);
      const detail = (await detailResponse.json()) as {
        quoteRequest: {
          id: string;
          status: string;
          quantity: string;
          offerPrice: string | null;
          paymentTerms: string | null;
          notes: string | null;
          buyer: { companyName: string | null; name: string | null; phone: string | null };
          coalListing: {
            id: string;
            title: string;
            category: string | null;
            coalType: string | null;
            specifications: { name: string; value: string; unit: string | null }[];
          };
        };
      };
      assert.equal(detail.quoteRequest.status, "PENDING");
      assert.equal(detail.quoteRequest.quantity, "3000");
      assert.equal(Number(detail.quoteRequest.offerPrice), 680000);
      assert.equal(detail.quoteRequest.paymentTerms, "TT after inspection");
      // Offer price is the buyer's initial proposal, distinct from any
      // transaction price - and no transaction exists for this offer yet.
      assert.equal(detail.quoteRequest.coalListing.id, TEST_LISTING_ID);
      assert.equal(detail.quoteRequest.coalListing.category, "LOW_NO_SPEC");
      assert.equal(detail.quoteRequest.coalListing.coalType, "ASALAN");
      assert.deepEqual(detail.quoteRequest.coalListing.specifications, [
        { name: "GAR", value: "5100", unit: "kcal/kg" },
        { name: "TM", value: "25", unit: "%" },
      ]);
      // Contact details appear only in the detail view.
      assert.equal(detail.quoteRequest.buyer.companyName, "Admin Flow Buyer");
      assert.equal(detail.quoteRequest.buyer.phone, "+62 813 0000 0000");
      assert.doesNotMatch(JSON.stringify(detail), /[a-f0-9]{64}/);
      assert.doesNotMatch(JSON.stringify(detail), /tokenHash/);
    });

    await test("GET /api/admin/quote-requests/[id] returns 404 for a missing id", async () => {
      const response = await adminDetailGet(
        adminApiRequest(rawSessionToken),
        offerCtx("does-not-exist"),
      );
      assert.equal(response.status, 404);
    });

    await test("PATCH opens negotiation and never reaches ACCEPTED on its own", async () => {
      const offerId = await createBuyerOffer();

      const step1 = await adminStatusPatch(
        adminPatchRequest(rawSessionToken, async () => ({ status: "IN_NEGOTIATION" })),
        offerCtx(offerId),
      );
      assert.equal(step1.status, 200);
      const step1Body = (await step1.json()) as {
        quoteRequest: { id: string; status: string; updatedAt: string };
      };
      assert.equal(step1Body.quoteRequest.id, offerId);
      assert.equal(step1Body.quoteRequest.status, "IN_NEGOTIATION");
      assert.equal(typeof step1Body.quoteRequest.updatedAt, "string");

      const row = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } });
      assert.equal(row.status, "IN_NEGOTIATION");
      // The buyer's original proposal is untouched by negotiation.
      assert.equal(Number(row.offerPrice), 650000);
      assert.equal(Number(row.quantity), 2000);
      assert.equal(row.paymentTerms, "Cash");

      // ACCEPTED (Disepakati) is NOT a status transition: it is only ever
      // produced together with the final Transaction.
      const accept = await adminStatusPatch(
        adminPatchRequest(rawSessionToken, async () => ({ status: "ACCEPTED" })),
        offerCtx(offerId),
      );
      assert.equal(accept.status, 409);
      assert.equal(
        (await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } })).status,
        "IN_NEGOTIATION",
      );

      // Moving a negotiated offer out of negotiation still never creates a
      // Transaction: the global count is unchanged.
      assert.equal(
        await prisma.transaction.findFirst({ where: { quoteRequestId: offerId } }),
        null,
      );
      assert.equal(await prisma.transaction.count(), transactionCountBefore);
    });

    await test("a finalized offer (ACCEPTED) is terminal", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);
      const finalized = await finalizeDeal(offerId);
      assert.equal(finalized.status, 201);

      const after = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } });
      assert.equal(after.status, "ACCEPTED");

      for (const target of ["REJECTED", "CANCELLED", "IN_NEGOTIATION"] as const) {
        const step = await adminStatusPatch(
          adminPatchRequest(rawSessionToken, async () => ({ status: target })),
          offerCtx(offerId),
        );
        assert.equal(step.status, 409, target);
      }
    });

    await test("REJECTED and CANCELLED are reachable and terminal", async () => {
      const rejectedId = await createBuyerOffer();
      const reject = await adminStatusPatch(
        adminPatchRequest(rawSessionToken, async () => ({ status: "REJECTED" })),
        offerCtx(rejectedId),
      );
      assert.equal(reject.status, 200);
      assert.equal(
        (await prisma.quoteRequest.findUniqueOrThrow({ where: { id: rejectedId } })).status,
        "REJECTED",
      );

      const cancelledId = await createBuyerOffer();
      const cancel = await adminStatusPatch(
        adminPatchRequest(rawSessionToken, async () => ({ status: "CANCELLED" })),
        offerCtx(cancelledId),
      );
      assert.equal(cancel.status, 200);
      assert.equal(
        (await prisma.quoteRequest.findUniqueOrThrow({ where: { id: cancelledId } })).status,
        "CANCELLED",
      );

      // Terminal: a rejected offer cannot be reopened.
      const reopen = await adminStatusPatch(
        adminPatchRequest(rawSessionToken, async () => ({ status: "IN_NEGOTIATION" })),
        offerCtx(rejectedId),
      );
      assert.equal(reopen.status, 409);
    });

    await test("PATCH processes only status and never touches guarded columns", async () => {
      const offerId = await createBuyerOffer();
      const before = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } });

      const response = await adminStatusPatch(
        adminPatchRequest(rawSessionToken, async () => ({
          status: "IN_NEGOTIATION",
          offerPrice: 1,
          quantity: 1,
          userId: "spoofed",
          coalListingId: "spoofed",
        })),
        offerCtx(offerId),
      );
      assert.equal(response.status, 200);

      const after = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } });
      assert.equal(after.status, "IN_NEGOTIATION");
      assert.equal(after.offerPrice?.toString() ?? null, before.offerPrice?.toString() ?? null);
      assert.equal(after.quantity.toString(), before.quantity.toString());
      assert.equal(after.userId, before.userId);
      assert.equal(after.coalListingId, before.coalListingId);
    });

    await test("PATCH rejects bad payloads and unknown ids", async () => {
      const offerId = await createBuyerOffer();
      const okSession = rawSessionToken;

      const unknownStatus = await adminStatusPatch(
        adminPatchRequest(okSession, async () => ({ status: "BOGUS" })),
        offerCtx(offerId),
      );
      assert.equal(unknownStatus.status, 400);

      const malformed = await adminStatusPatch(
        adminPatchRequest(okSession, async () => {
          throw new SyntaxError("unexpected token");
        }),
        offerCtx(offerId),
      );
      assert.equal(malformed.status, 400);

      const nonObject = await adminStatusPatch(
        adminPatchRequest(okSession, async () => "just a string"),
        offerCtx(offerId),
      );
      assert.equal(nonObject.status, 400);

      const missing = await adminStatusPatch(
        adminPatchRequest(okSession, async () => ({ status: "ACCEPTED" })),
        offerCtx("does-not-exist"),
      );
      assert.equal(missing.status, 404);

      const noop = await adminStatusPatch(
        adminPatchRequest(okSession, async () => ({ status: "PENDING" })),
        offerCtx(offerId),
      );
      assert.equal(noop.status, 409);

      // ACCEPTED is not a legal status transition at all.
      const accepted = await adminStatusPatch(
        adminPatchRequest(okSession, async () => ({ status: "ACCEPTED" })),
        offerCtx(offerId),
      );
      assert.equal(accepted.status, 409);
    });

    await test("PATCH requires an admin session and ignores buyer tokens", async () => {
      const offerId = await createBuyerOffer();
      const okBody = async () => ({ status: "IN_NEGOTIATION" });

      const unauthenticated = await adminStatusPatch(
        adminPatchRequest(undefined, okBody),
        offerCtx(offerId),
      );
      assert.equal(unauthenticated.status, 401);

      const invalidSession = await adminStatusPatch(
        adminPatchRequest("not-a-real-session-token", okBody),
        offerCtx(offerId),
      );
      assert.equal(invalidSession.status, 401);

      // A buyer magic link is not an admin session: sent in the session cookie
      // it must still be rejected, never used as authorisation.
      const buyerToken = await adminStatusPatch(
        adminPatchRequest(buyerAccessRaw, okBody),
        offerCtx(offerId),
      );
      assert.equal(buyerToken.status, 401);

      // A real session for an INACTIVE admin account is answered 403.
      const inactive = await adminStatusPatch(
        adminPatchRequest(inactiveAdminRaw, okBody),
        offerCtx(offerId),
      );
      assert.equal(inactive.status, 403);
    });

    await test("PENDING -> IN_NEGOTIATION -> finalisasi: Transaction CONFIRMED, offer untouched, WhatsApp link works", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);

      const response = await finalizeDeal(offerId);
      const rawBody = await response.json().catch(() => null);
      assert.equal(response.status, 201, JSON.stringify(rawBody));
      const body = rawBody as {
        transaction: {
          id: string;
          quoteRequestId: string;
          quantity: string;
          price: string;
          paymentTerms: string | null;
          status: string;
          createdAt: string;
        };
      };
      assert.equal(body.transaction.quoteRequestId, offerId);
      assert.equal(body.transaction.status, "CONFIRMED");
      assert.equal(body.transaction.price, "680000");
      assert.equal(body.transaction.quantity, "2000");
      assert.equal(body.transaction.paymentTerms, "Cash");

      const tx = await prisma.transaction.findUniqueOrThrow({
        where: { quoteRequestId: offerId },
      });
      assert.equal(Number(tx.price), 680000);
      assert.equal(Number(tx.quantity), 2000);
      assert.equal(tx.paymentTerms, "Cash");
      assert.equal(tx.status, "CONFIRMED");
      assert.equal(tx.quoteRequestId, offerId);
      assert.equal(tx.userId, TEST_BUYER_ID);
      assert.equal(tx.coalListingId, TEST_LISTING_ID);

      // Historical integrity: the buyer's original offer is not rewritten.
      const offer = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } });
      assert.equal(offer.status, "ACCEPTED");
      assert.equal(Number(offer.offerPrice), 650000);
      assert.equal(Number(offer.quantity), 2000);
      assert.equal(offer.paymentTerms, "Cash");
      assert.notEqual(Number(offer.offerPrice), Number(tx.price));

      // The admin detail API now returns the created Transaction.
      const detailResponse = await adminDetailGet(adminApiRequest(rawSessionToken), offerCtx(offerId));
      assert.equal(detailResponse.status, 200);
      const detail = (await detailResponse.json()) as {
        quoteRequest: {
          status: string;
          offerPrice: string | null;
          transaction: {
            id: string;
            price: string;
            quantity: string;
            status: string;
          } | null;
        };
      };
      assert.equal(detail.quoteRequest.status, "ACCEPTED");
      assert.equal(Number(detail.quoteRequest.offerPrice), 650000);
      assert.equal(detail.quoteRequest.transaction?.status, "CONFIRMED");
      assert.equal(Number(detail.quoteRequest.transaction?.price), 680000);

      // Seller -> buyer deep link: recipient is the buyer's dial number, the
      // prefilled message carries the deal, and no secret is present.
      const buyer = await prisma.user.findUniqueOrThrow({ where: { id: TEST_BUYER_ID } });
      const url = buildSendDealWhatsAppUrl(buyer.phone, {
        buyerName: buyer.name,
        listingTitle: "Admin Flow Lot",
        quantity: tx.quantity.toString(),
        price: tx.price.toString(),
        paymentTerms: tx.paymentTerms,
        transactionId: tx.id,
      });
      assert.ok(url !== null);
      assert.ok(url.startsWith("https://wa.me/6281300000000?text="), url ?? "");
      const prefilled = decodeURIComponent((url as string).split("text=")[1]);
      assert.ok(prefilled.includes("Admin Flow Lot"));
      assert.ok(prefilled.includes("2,000 MT"));
      assert.ok(prefilled.includes("Rp 680,000 / MT"));
      assert.ok(prefilled.includes(tx.id));
      for (const secret of ["tokenHash", "AccessToken", "admin_session"]) {
        assert.ok(!url.includes(secret), `link must not contain ${secret}`);
      }
    });

    await test("only an offer in negotiation can be finalized", async () => {
      for (const status of ["PENDING", "REJECTED", "CANCELLED"] as const) {
        const offerId = await createBuyerOffer();
        if (status !== "PENDING") {
          const move = await adminStatusPatch(
            adminPatchRequest(rawSessionToken, async () => ({ status })),
            offerCtx(offerId),
          );
          assert.equal(move.status, 200, status);
        }
        const response = await finalizeDeal(offerId);
        assert.equal(response.status, 409, `${status} offer must not be finalized`);
        assert.equal(
          await prisma.transaction.findFirst({ where: { quoteRequestId: offerId } }),
          null,
          status,
        );
      }
    });

    await test("an already finalized offer cannot be finalized again", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);
      assert.equal((await finalizeDeal(offerId)).status, 201);

      const again = await finalizeDeal(offerId);
      assert.equal(again.status, 409);
      const body = (await again.json()) as { error: string };
      assert.equal(body.error, "Penawaran ini sudah memiliki transaksi.");
      assert.equal(await prisma.transaction.count({ where: { quoteRequestId: offerId } }), 1);
    });

    await test("finalisasi rejects invalid payloads and leaves no partial state", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);

      const cases: [string, () => Promise<unknown>, number][] = [
        ["malformed JSON", async () => { throw new SyntaxError("bad json"); }, 400],
        ["non-object body", async () => "just a string", 400],
        ["missing quantity", async () => ({ price: 680000 }), 400],
        ["quantity zero", async () => ({ quantity: 0, price: 680000 }), 400],
        ["quantity negative", async () => ({ quantity: -5, price: 680000 }), 400],
        ["quantity over available", async () => ({ quantity: 5001, price: 680000 }), 400],
        ["missing price", async () => ({ quantity: 2000 }), 400],
        ["price zero", async () => ({ quantity: 2000, price: 0 }), 400],
        ["price negative", async () => ({ quantity: 2000, price: -1 }), 400],
        ["invalid paymentTerms", async () => ({ quantity: 2000, price: 680000, paymentTerms: 42 }), 400],
        ["excessive price precision", async () => ({ quantity: 2000, price: 680000.005 }), 400],
        ["excessive string length", async () => ({ quantity: 2000, price: 680000, paymentTerms: "x".repeat(501) }), 400],
      ];

      for (const [label, json, expected] of cases) {
        const response = await finalizeDeal(offerId, json);
        assert.equal(response.status, expected, label);
      }

      // Unknown offer id -> 404 (before any status/duplicate logic).
      const missing = await adminTransactionPost(
        adminPatchRequest(rawSessionToken, FINAL_DEAL_PAYLOAD),
        offerCtx("does-not-exist"),
      );
      assert.equal(missing.status, 404);

      // No partial state: no Transaction, and the offer is still finalizable.
      assert.equal(
        await prisma.transaction.findFirst({ where: { quoteRequestId: offerId } }),
        null,
      );
      const still = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } });
      assert.equal(still.status, "IN_NEGOTIATION");
      assert.equal((await finalizeDeal(offerId)).status, 201);
    });

    await test("finalization validation messages are in Bahasa Indonesia", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);

      const cases: [unknown, string][] = [
        [undefined, "Permintaan tidak valid."],
        [{ price: 680000 }, "Kuantitas kesepakatan wajib diisi."],
        [{ quantity: 0, price: 680000 }, "Kuantitas kesepakatan harus lebih dari 0."],
        [{ quantity: 5001, price: 680000 }, "Kuantitas melebihi jumlah yang tersedia."],
        [{ quantity: 2000 }, "Harga kesepakatan wajib diisi."],
        [{ quantity: 2000, price: 0 }, "Harga kesepakatan harus lebih dari 0."],
      ];

      for (const [payload, expected] of cases) {
        const response = await adminTransactionPost(
          adminPatchRequest(rawSessionToken, async () => {
            if (payload === undefined) throw new SyntaxError("bad json");
            return payload;
          }),
          offerCtx(offerId),
        );
        assert.equal(response.status, 400, JSON.stringify(payload));
        const body = (await response.json()) as { error: string };
        assert.equal(body.error, expected);
      }
    });

    await test("a Buyer Offer gets at most one Transaction; duplicates are 409", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);

      const first = await finalizeDeal(offerId);
      assert.equal(first.status, 201);

      const second = await finalizeDeal(offerId);
      assert.equal(second.status, 409);
      const body = (await second.json()) as { error: string };
      assert.ok(body.error.length > 0);

      const rows = await prisma.transaction.findMany({ where: { quoteRequestId: offerId } });
      assert.equal(rows.length, 1);
    });

    await test("two concurrent finalizations produce exactly one Transaction", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);

      const [first, second] = await Promise.all([
        finalizeDeal(offerId),
        finalizeDeal(offerId),
      ]);
      const statuses = [first.status, second.status].sort();
      assert.deepEqual(statuses, [201, 409]);

      const rows = await prisma.transaction.findMany({ where: { quoteRequestId: offerId } });
      assert.equal(rows.length, 1);
      assert.equal(
        (await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } })).status,
        "ACCEPTED",
      );
    });

    await test("finalization never honours client-supplied identity or status", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);

      const response = await adminTransactionPost(
        adminPatchRequest(rawSessionToken, async () => ({
          quantity: 2000,
          price: 680000,
          paymentTerms: "Cash",
          quoteRequestId: "spoofed",
          userId: "spoofed",
          coalListingId: "spoofed",
          status: "COMPLETED",
        })),
        offerCtx(offerId),
      );
      assert.equal(response.status, 201);

      const tx = await prisma.transaction.findUniqueOrThrow({ where: { quoteRequestId: offerId } });
      assert.equal(tx.quoteRequestId, offerId);
      assert.equal(tx.userId, TEST_BUYER_ID);
      assert.equal(tx.coalListingId, TEST_LISTING_ID);
      assert.equal(tx.status, "CONFIRMED");
    });

    await test("finalization requires an admin session and rejects buyer tokens", async () => {
      const offerId = await createBuyerOffer();
      await startNegotiation(offerId);
      const body = async () => ({ quantity: 2000, price: 680000, paymentTerms: "Cash" });

      const unauthenticated = await adminTransactionPost(
        adminPatchRequest(undefined, body),
        offerCtx(offerId),
      );
      assert.equal(unauthenticated.status, 401);

      const invalidSession = await adminTransactionPost(
        adminPatchRequest("not-a-real-session-token", body),
        offerCtx(offerId),
      );
      assert.equal(invalidSession.status, 401);

      // A buyer magic link is not an admin session.
      const buyerToken = await adminTransactionPost(
        adminPatchRequest(buyerAccessRaw, body),
        offerCtx(offerId),
      );
      assert.equal(buyerToken.status, 401);

      // A real session for an INACTIVE admin account is answered 403.
      const inactive = await adminTransactionPost(
        adminPatchRequest(inactiveAdminRaw, body),
        offerCtx(offerId),
      );
      assert.equal(inactive.status, 403);

      // None of the rejected attempts changed anything.
      assert.equal(
        await prisma.transaction.findFirst({ where: { quoteRequestId: offerId } }),
        null,
      );
      assert.equal(
        (await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } })).status,
        "IN_NEGOTIATION",
      );
    });

    await test("the retained historical offer is never drawn into the transaction flow", async () => {
      // Legacy offerPrice = NULL and status PENDING: it stays exactly as it is,
      // and no Transaction can arise from it even though it already has a
      // unique quoteRequestId in the Transaction space.
      const retained = await prisma.quoteRequest.findUniqueOrThrow({
        where: { id: "cmul3vnfz00007lyjpocfr19j" },
        select: { status: true, offerPrice: true, quantity: true, paymentTerms: true },
      });
      assert.equal(retained.status, "PENDING");
      assert.equal(retained.offerPrice, null);
      assert.equal(Number(retained.quantity), 1500);
      assert.equal(retained.paymentTerms, "LC at sight");
      assert.equal(
        await prisma.transaction.findFirst({
          where: { quoteRequestId: "cmul3vnfz00007lyjpocfr19j" },
        }),
        null,
      );
    });
  } finally {
    await teardown();
    const countsAfter = await countsSnapshot();
    assert.deepEqual(countsAfter, countsBefore, "test data must be fully removed");
  }
});