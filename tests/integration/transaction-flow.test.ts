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
import { GET as transactionListGet } from "../../app/api/admin/transactions/route";
import {
  GET as transactionDetailGet,
  PATCH as transactionStatusPatch,
} from "../../app/api/admin/transactions/[id]/route";
import { POST as quotePost } from "../../app/api/offer/[token]/quote/route";
import {
  PATCH as adminStatusPatch,
} from "../../app/api/admin/quote-requests/[id]/route";
import { POST as adminTransactionPost } from "../../app/api/admin/quote-requests/[id]/transaction/route";
import { buildSendDealWhatsAppUrl } from "../../lib/whatsapp";

/**
 * Integration tests for the Transaction management flow.
 *
 * Covers the admin Transaction list and detail endpoints plus the status-only
 * update: authorisation is centralised, only `status` is ever writable
 * (price / quantity / paymentTerms / identity columns cannot be touched
 * through PATCH), the lifecycle is explicit (CONFIRMED -> PROCESSING ->
 * COMPLETED, with CANCELLED reachable from CONFIRMED and PROCESSING and both
 * terminal states protected), and the seller -> buyer WhatsApp deep link is a
 * plain wa.me URL built from the final Transaction, never the historical
 * Buyer Offer price.
 *
 * Test rows carry fixed TEST_TX_* ids and are removed in teardown; seed rows
 * are only read.
 */

const TEST_ADMIN_ID = "tx-flow-admin";
const TEST_ADMIN_EMAIL = "tx-flow-admin@local.test";
const TEST_BUYER_ID = "tx-flow-buyer";
const TEST_LISTING_ID = "tx-flow-listing";
const TEST_INACTIVE_ADMIN_ID = "tx-flow-admin-inactive";

const BUYER_OFFER_PAYLOAD = {
  listingId: TEST_LISTING_ID,
  quantity: 2000,
  offerPrice: 650000,
  paymentTerms: "Cash",
  notes: "Transaction flow test",
};

const FINAL_DEAL_PAYLOAD = async () => ({
  quantity: 2000,
  price: 680000,
  paymentTerms: "Cash",
});

/** Minimal stand-in for NextRequest covering what the admin routes read. */
function adminApiRequest(
  cookieValue: string | undefined,
  statusParam?: string | null,
): NextRequest {
  const url = new URL(
    `http://localhost/api/admin/transactions${
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
function patchRequest(
  cookieValue: string | undefined,
  json: () => Promise<unknown>,
): NextRequest {
  const fake = {
    nextUrl: new URL("http://localhost/api/admin/transactions/test-id"),
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

function txCtx(id: string): { params: Promise<{ id: string }> } {
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
      name: "Tx Flow Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const buyer = await prisma.user.create({
    data: {
      id: TEST_BUYER_ID,
      companyName: "Transaction Flow Buyer",
      name: "Andi",
      phone: "+62 813 0000 0000",
      email: "tx-flow-buyer@local.test",
      role: "BUYER",
      status: "ACTIVE",
    },
  });

  const listing = await prisma.coalListing.create({
    data: {
      id: TEST_LISTING_ID,
      title: "Transaction Flow Lot",
      category: "SPEC_COAL",
      coalType: "OTHER",
      typeLabel: "5600 GAR",
      origin: "Kalimantan",
      pricingMode: "NEGOTIABLE",
      quantity: 5000,
      status: "PUBLISHED",
    },
  });

  await prisma.coalSpecification.createMany({
    data: [
      { coalListingId: listing.id, name: "GAR", value: "5600", unit: "kcal/kg" },
      { coalListingId: listing.id, name: "TM", value: "22", unit: "%" },
    ],
  });

  const inactiveAdmin = await prisma.user.create({
    data: {
      id: TEST_INACTIVE_ADMIN_ID,
      email: "tx-flow-inactive@local.test",
      name: "Inactive Tx Admin",
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

test("admin Transaction flow against the real database", async () => {
  const countsBefore = await countsSnapshot();

  const { buyer, inactiveAdmin } = await setup();
  const rawSessionToken = randomBytes(32).toString("base64url");
  const adminRow = await prisma.user.findUniqueOrThrow({ where: { id: TEST_ADMIN_ID } });

  const buyerAccessRaw = `tx-flow-buyer-access-${randomBytes(8).toString("hex")}`;
  const inactiveAdminRaw = `tx-flow-inactive-${randomBytes(8).toString("hex")}`;

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
   * Opens negotiation on an offer through the real status endpoint. This is the
   * first half of the deal; the second half is the finalization POST below.
   */
  async function startNegotiation(offerId: string): Promise<void> {
    const response = await adminStatusPatch(
      patchRequest(rawSessionToken, async () => ({ status: "IN_NEGOTIATION" })),
      offerCtx(offerId),
    );
    assert.equal(response.status, 200);
  }

  /**
   * Runs a buyer offer through negotiation and "Finalisasi Kesepakatan",
   * returning the new Transaction id plus its offer id. The two steps together
   * are the only path from an offer to a deal.
   */
  async function createTransaction(): Promise<{ txId: string; offerId: string }> {
    const offerId = await createBuyerOffer();
    await startNegotiation(offerId);
    const response = await adminTransactionPost(
      patchRequest(rawSessionToken, FINAL_DEAL_PAYLOAD),
      offerCtx(offerId),
    );
    const rawBody = await response.json().catch(() => null);
    assert.equal(response.status, 201, JSON.stringify(rawBody));
    const body = rawBody as { transaction: { id: string; status: string } };
    assert.equal(body.transaction.status, "CONFIRMED");
    return { txId: body.transaction.id, offerId };
  }

  try {
    await prisma.adminSession.create({
      data: {
        userId: adminRow.id,
        tokenHash: hashSessionToken(rawSessionToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
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

    await test("GET /api/admin/transactions lists the created Transaction without leaks", async () => {
      const { txId } = await createTransaction();

      const response = await transactionListGet(adminApiRequest(rawSessionToken));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        transactions: {
          id: string;
          status: string;
          quantity: string;
          price: string;
          paymentTerms: string | null;
          createdAt: string;
          buyer: { companyName: string | null; name: string | null };
          coalListing: { id: string; title: string };
        }[];
        filter: { status: string | null };
        total: number;
        hasMore: boolean;
      };
      const row = body.transactions.find((r) => r.id === txId);
      assert.ok(row !== undefined, "expected the created transaction in the list");
      assert.equal(row.status, "CONFIRMED");
      assert.equal(row.quantity, "2000");
      // The Transaction price is the final agreed price, not the Offer Price.
      assert.equal(row.price, "680000");
      assert.equal(row.paymentTerms, "Cash");
      assert.equal(row.buyer.companyName, "Transaction Flow Buyer");
      assert.equal(row.buyer.name, "Andi");
      assert.equal(row.coalListing.id, TEST_LISTING_ID);
      assert.equal(row.coalListing.title, "Transaction Flow Lot");
      assert.equal(body.filter.status, null);
      assert.equal(typeof body.total, "number");
      assert.equal(typeof body.hasMore, "boolean");

      // No contact details, no token/session data in the list payload.
      const serialized = JSON.stringify(body);
      assert.doesNotMatch(serialized, /[a-f0-9]{64}/);
      assert.doesNotMatch(serialized, /tokenHash/);
      assert.doesNotMatch(serialized, /admin_session/);
      assert.doesNotMatch(serialized, /\+62 813/);
    });

    await test("GET /api/admin/transactions orders newest first and filters by status", async () => {
      const first = await createTransaction();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createTransaction();

      const all = await transactionListGet(adminApiRequest(rawSessionToken));
      const allBody = (await all.json()) as { transactions: { id: string; status: string }[] };
      const indexOf = (id: string) =>
        allBody.transactions.findIndex((r) => r.id === id);
      // Newest first with deterministic ordering.
      assert.ok(indexOf(second.txId) < indexOf(first.txId));

      // Move the second transaction to PROCESSING, then both filters line up.
      const promote = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "PROCESSING" })),
        txCtx(second.txId),
      );
      assert.equal(promote.status, 200);

      const confirmed = (await transactionListGet(
        adminApiRequest(rawSessionToken, "CONFIRMED"),
      ).then((r) => r.json())) as { transactions: { id: string }[] };
      assert.ok(confirmed.transactions.some((r) => r.id === first.txId));
      assert.equal(confirmed.transactions.some((r) => r.id === second.txId), false);

      const processing = (await transactionListGet(
        adminApiRequest(rawSessionToken, "PROCESSING"),
      ).then((r) => r.json())) as { transactions: { id: string; status: string }[] };
      assert.ok(processing.transactions.some((r) => r.id === second.txId));
      assert.equal(processing.transactions.some((r) => r.id === first.txId), false);
    });

    await test("GET /api/admin/transactions requires auth and rejects bad filters", async () => {
      const unauthenticated = await transactionListGet(adminApiRequest(undefined));
      assert.equal(unauthenticated.status, 401);

      const invalidSession = await transactionListGet(adminApiRequest("not-a-real-session"));
      assert.equal(invalidSession.status, 401);

      const inactive = await transactionListGet(adminApiRequest(inactiveAdminRaw));
      assert.equal(inactive.status, 403);

      // A buyer magic link is not admin authorisation.
      const buyerToken = await transactionListGet(adminApiRequest(buyerAccessRaw));
      assert.equal(buyerToken.status, 401);

      // Unknown status (including PENDING) -> 400.
      const badFilter = await transactionListGet(adminApiRequest(rawSessionToken, "QUOTED"));
      assert.equal(badFilter.status, 400);
      const pendingFilter = await transactionListGet(adminApiRequest(rawSessionToken, "PENDING"));
      assert.equal(pendingFilter.status, 400);
      const emptyFilter = await transactionListGet(adminApiRequest(rawSessionToken, ""));
      assert.equal(emptyFilter.status, 400);
    });

    await test("GET /api/admin/transactions/[id] returns transaction, buyer, listing, specs, and source offer", async () => {
      const { txId, offerId } = await createTransaction();

      const response = await transactionDetailGet(adminApiRequest(rawSessionToken), txCtx(txId));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        transaction: {
          id: string;
          status: string;
          quantity: string;
          price: string;
          paymentTerms: string | null;
          createdAt: string;
          updatedAt: string;
        };
        buyer: {
          companyName: string | null;
          name: string | null;
          phone: string | null;
          email: string | null;
        };
        coalListing: {
          id: string;
          title: string;
          category: string | null;
          coalType: string | null;
          typeLabel: string | null;
          origin: string | null;
          quantity: string | null;
          specifications: { name: string; value: string; unit: string | null }[];
        };
        sourceOffer: {
          id: string;
          status: string;
          quantity: string;
          offerPrice: string | null;
          paymentTerms: string | null;
          createdAt: string;
        };
      };

      // Transaction data.
      assert.equal(body.transaction.id, txId);
      assert.equal(body.transaction.status, "CONFIRMED");
      assert.equal(body.transaction.quantity, "2000");
      assert.equal(body.transaction.price, "680000");
      assert.equal(body.transaction.paymentTerms, "Cash");

      // Trusted buyer data.
      assert.equal(body.buyer.companyName, "Transaction Flow Buyer");
      assert.equal(body.buyer.name, "Andi");
      assert.equal(body.buyer.phone, "+62 813 0000 0000");
      assert.equal(body.buyer.email, "tx-flow-buyer@local.test");

      // Listing summary with flexible specifications.
      assert.equal(body.coalListing.id, TEST_LISTING_ID);
      assert.equal(body.coalListing.title, "Transaction Flow Lot");
      assert.equal(body.coalListing.category, "SPEC_COAL");
      assert.equal(body.coalListing.coalType, "OTHER");
      assert.equal(body.coalListing.typeLabel, "5600 GAR");
      assert.equal(body.coalListing.origin, "Kalimantan");
      assert.deepEqual(body.coalListing.specifications, [
        { name: "GAR", value: "5600", unit: "kcal/kg" },
        { name: "TM", value: "22", unit: "%" },
      ]);

      // Source Buyer Offer summary - offer price is the historical proposal,
      // deliberately separate from the Transaction price.
      assert.equal(body.sourceOffer.id, offerId);
      assert.equal(body.sourceOffer.status, "ACCEPTED");
      assert.equal(body.sourceOffer.quantity, "2000");
      assert.equal(Number(body.sourceOffer.offerPrice), 650000);
      assert.notEqual(Number(body.sourceOffer.offerPrice), Number(body.transaction.price));
      assert.equal(body.sourceOffer.paymentTerms, "Cash");

      // No secrets anywhere in the payload.
      const serialized = JSON.stringify(body);
      assert.doesNotMatch(serialized, /[a-f0-9]{64}/);
      assert.doesNotMatch(serialized, /tokenHash/);
      assert.doesNotMatch(serialized, /admin_session/);
    });

    await test("GET /api/admin/transactions/[id] returns 404 for a missing id", async () => {
      const response = await transactionDetailGet(
        adminApiRequest(rawSessionToken),
        txCtx("does-not-exist"),
      );
      assert.equal(response.status, 404);
    });

    await test("status lifecycle: CONFIRMED -> PROCESSING -> COMPLETED, then terminal", async () => {
      const { txId } = await createTransaction();

      const step1 = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "PROCESSING" })),
        txCtx(txId),
      );
      assert.equal(step1.status, 200);
      const step1Body = (await step1.json()) as {
        transaction: { id: string; status: string; updatedAt: string };
      };
      assert.equal(step1Body.transaction.id, txId);
      assert.equal(step1Body.transaction.status, "PROCESSING");
      assert.equal(typeof step1Body.transaction.updatedAt, "string");

      let row = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
      assert.equal(row.status, "PROCESSING");
      // Status updates never touch the commercial terms.
      assert.equal(Number(row.price), 680000);
      assert.equal(Number(row.quantity), 2000);
      assert.equal(row.paymentTerms, "Cash");
      assert.equal(row.userId, TEST_BUYER_ID);
      assert.equal(row.coalListingId, TEST_LISTING_ID);

      const step2 = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "COMPLETED" })),
        txCtx(txId),
      );
      assert.equal(step2.status, 200);
      row = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
      assert.equal(row.status, "COMPLETED");

      // COMPLETED is terminal.
      const reopen = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "PROCESSING" })),
        txCtx(txId),
      );
      assert.equal(reopen.status, 409);
      const cancelDone = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "CANCELLED" })),
        txCtx(txId),
      );
      assert.equal(cancelDone.status, 409);
    });

    await test("status lifecycle: CONFIRMED -> CANCELLED and PROCESSING -> CANCELLED", async () => {
      // CONFIRMED -> CANCELLED.
      const confirmed = await createTransaction();
      const cancelFresh = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "CANCELLED" })),
        txCtx(confirmed.txId),
      );
      assert.equal(cancelFresh.status, 200);
      assert.equal(
        (await prisma.transaction.findUniqueOrThrow({ where: { id: confirmed.txId } })).status,
        "CANCELLED",
      );

      // PROCESSING -> CANCELLED.
      const processing = await createTransaction();
      const promote = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "PROCESSING" })),
        txCtx(processing.txId),
      );
      assert.equal(promote.status, 200);
      const cancel = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "CANCELLED" })),
        txCtx(processing.txId),
      );
      assert.equal(cancel.status, 200);

      // CANCELLED is terminal: no reopening to any state.
      for (const target of ["PROCESSING", "CONFIRMED", "COMPLETED"] as const) {
        const reopen = await transactionStatusPatch(
          patchRequest(rawSessionToken, async () => ({ status: target })),
          txCtx(processing.txId),
        );
        assert.equal(reopen.status, 409, `CANCELLED -> ${target} must be rejected`);
      }
    });

    await test("PATCH processes only status and never touches guarded columns", async () => {
      const { txId, offerId } = await createTransaction();
      const before = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });

      const response = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({
          status: "PROCESSING",
          price: 1,
          quantity: 1,
          paymentTerms: "spoofed",
          userId: "spoofed",
          coalListingId: "spoofed",
          quoteRequestId: "spoofed",
        })),
        txCtx(txId),
      );
      assert.equal(response.status, 200);

      const after = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
      assert.equal(after.status, "PROCESSING");
      assert.equal(after.price.toString(), before.price.toString());
      assert.equal(after.quantity.toString(), before.quantity.toString());
      assert.equal(after.paymentTerms, before.paymentTerms);
      assert.equal(after.userId, before.userId);
      assert.equal(after.coalListingId, before.coalListingId);
      assert.equal(after.quoteRequestId, offerId);
    });

    await test("PATCH rejects bad payloads and unknown ids", async () => {
      const { txId } = await createTransaction();

      const unknownStatus = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "BOGUS" })),
        txCtx(txId),
      );
      assert.equal(unknownStatus.status, 400);

      const malformed = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => {
          throw new SyntaxError("unexpected token");
        }),
        txCtx(txId),
      );
      assert.equal(malformed.status, 400);

      const nonObject = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => "just a string"),
        txCtx(txId),
      );
      assert.equal(nonObject.status, 400);

      const missing = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "PROCESSING" })),
        txCtx("does-not-exist"),
      );
      assert.equal(missing.status, 404);

      // No-op: re-applying the current status is a conflict, not a success.
      const noop = await transactionStatusPatch(
        patchRequest(rawSessionToken, async () => ({ status: "CONFIRMED" })),
        txCtx(txId),
      );
      assert.equal(noop.status, 409);
    });

    await test("PATCH requires an admin session and ignores buyer tokens", async () => {
      const { txId } = await createTransaction();
      const okBody = async () => ({ status: "PROCESSING" });

      const unauthenticated = await transactionStatusPatch(
        patchRequest(undefined, okBody),
        txCtx(txId),
      );
      assert.equal(unauthenticated.status, 401);

      const invalidSession = await transactionStatusPatch(
        patchRequest("not-a-real-session-token", okBody),
        txCtx(txId),
      );
      assert.equal(invalidSession.status, 401);

      // A buyer magic link is not an admin session.
      const buyerToken = await transactionStatusPatch(
        patchRequest(buyerAccessRaw, okBody),
        txCtx(txId),
      );
      assert.equal(buyerToken.status, 401);

      // A real session for an INACTIVE admin account is answered 403.
      const inactive = await transactionStatusPatch(
        patchRequest(inactiveAdminRaw, okBody),
        txCtx(txId),
      );
      assert.equal(inactive.status, 403);
    });

    await test("WhatsApp deep link targets the buyer with the final deal", async () => {
      const { txId, offerId } = await createTransaction();

      const detailResponse = await transactionDetailGet(
        adminApiRequest(rawSessionToken),
        txCtx(txId),
      );
      const detail = (await detailResponse.json()) as {
        transaction: {
          id: string;
          quantity: string;
          price: string;
          paymentTerms: string | null;
        };
        buyer: { name: string | null; phone: string | null };
        coalListing: { title: string };
      };

      const url = buildSendDealWhatsAppUrl(detail.buyer.phone, {
        buyerName: detail.buyer.name,
        listingTitle: detail.coalListing.title,
        quantity: detail.transaction.quantity,
        price: detail.transaction.price,
        paymentTerms: detail.transaction.paymentTerms,
        transactionId: detail.transaction.id,
      });
      assert.ok(url !== null);
      assert.ok(url.startsWith("https://wa.me/6281300000000?text="), url ?? "");
      const prefilled = decodeURIComponent((url as string).split("text=")[1]);

      // The message represents the final Transaction, not the Buyer Offer.
      assert.ok(prefilled.includes("Hi Andi,"));
      assert.ok(prefilled.includes("Transaction Flow Lot"));
      assert.ok(prefilled.includes("Agreed Quantity:"));
      assert.ok(prefilled.includes("2,000 MT"));
      assert.ok(prefilled.includes("Final Agreed Price:"));
      assert.ok(prefilled.includes("Rp 680,000 / MT"));
      assert.ok(prefilled.includes("Payment Terms:"));
      assert.ok(prefilled.includes("Cash"));
      assert.ok(prefilled.includes("Deal Reference:"));
      assert.ok(prefilled.includes(detail.transaction.id));
      // The historical Offer Price (650,000) must not leak into the message.
      assert.ok(!prefilled.includes("650,000"));

      for (const secret of ["tokenHash", "AccessToken", "admin_session"]) {
        assert.ok(!url.includes(secret), `link must not contain ${secret}`);
      }

      // The offer still exists as a separate, untouched record.
      const offer = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: offerId } });
      assert.equal(Number(offer.offerPrice), 650000);
    });

    await test("the retained historical offer is never drawn into the transaction flow", async () => {
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