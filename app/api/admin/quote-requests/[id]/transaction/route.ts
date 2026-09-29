import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import { parseFinalTransactionInput } from "@/lib/final-transaction";
import type { TransactionCreateResponse } from "@/lib/quote-requests";

/**
 * "Finalisasi Kesepakatan" - deal finalization for one buyer offer.
 *
 * This single operation turns a Buyer Offer into a deal: in one atomic database
 * commit it creates the final Transaction (CONFIRMED) AND marks the offer
 * Disepakati (ACCEPTED). There is deliberately no separate "accept offer" step -
 * removing ACCEPTED from OFFER_STATUS_TRANSITIONS makes this endpoint the ONLY
 * way an offer can reach that status, so an accepted offer without a final
 * transaction is structurally impossible.
 *
 * Only an offer in negotiation (IN_NEGOTIATION) can be finalized; any other
 * status answers 409. Everything that identifies the deal - quoteRequestId,
 * userId, coalListingId, status - is derived from the offer, never from the
 * request body, so a client cannot create a deal for another offer, user, or
 * listing. The client controls only the negotiated terms: quantity, price and
 * payment terms.
 *
 * The buyer's original proposal (offerPrice, quantity, paymentTerms) is left
 * untouched - the final price lives on its own Transaction record, and
 * offerPrice is never overwritten.
 *
 * Atomicity: claiming the offer and writing the Transaction happen inside one
 * interactive transaction, and the offer is claimed with a status-guarded
 * updateMany. If anything fails - a losing concurrent finalization, the
 * quoteRequestId unique constraint, a database error - the whole commit rolls
 * back, leaving no Transaction and the offer status unchanged.
 *
 * Access control is the shared authorizeAdminRequest call and nothing else.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * True for Prisma's unique-constraint violation.
 *
 * Checked structurally rather than with `instanceof`: the generated error class
 * is not guaranteed to be the same object identity across module instances,
 * so `instanceof` can silently be false. The stable `code` property is what the
 * conflict is actually identified by.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Signals "the offer was no longer finalizable" from inside the transaction. */
class OfferNotFinalizableError extends Error {}

function conflict(message: string): Response {
  return Response.json({ error: message }, { status: 409, headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/quote-requests/[id]/transaction">,
): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Permintaan tidak valid." },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = parseFinalTransactionInput(payload);
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const offer = await prisma.quoteRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        userId: true,
        coalListingId: true,
        coalListing: { select: { quantity: true } },
      },
    });

    if (offer === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    // One offer, at most one finalized deal. The unique constraint below is the
    // authoritative guard; this lookup gives a clean 409 for the common case.
    const existing = await prisma.transaction.findUnique({
      where: { quoteRequestId: id },
      select: { id: true },
    });
    if (existing !== null) {
      return conflict("Penawaran ini sudah memiliki transaksi.");
    }

    // Finalization is only reachable from negotiation. ACCEPTED in particular is
    // rejected here, which is what makes "already finalized" idempotently safe.
    if (offer.status !== "IN_NEGOTIATION") {
      return conflict(
        "Hanya penawaran yang sedang dinegosiasikan yang dapat difinalisasi.",
      );
    }

    const available = offer.coalListing.quantity;
    if (available !== null && parsed.value.quantity > Number(available)) {
      return Response.json(
        { error: "Kuantitas melebihi jumlah yang tersedia." },
        { status: 400, headers: NO_STORE },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      // Claim the offer first, guarded by the status it must still be in. This
      // is the concurrency gate: a second admin finalizing the same offer at the
      // same moment matches zero rows, throws, and rolls the whole commit back
      // rather than producing a second Transaction.
      const claimed = await tx.quoteRequest.updateMany({
        where: { id, status: "IN_NEGOTIATION" },
        data: { status: "ACCEPTED" },
      });
      if (claimed.count === 0) {
        throw new OfferNotFinalizableError();
      }

      return tx.transaction.create({
        data: {
          // Identity is derived from the offer, never from the client.
          quoteRequestId: id,
          userId: offer.userId,
          coalListingId: offer.coalListingId,
          quantity: parsed.value.quantity,
          // The final agreed price - a separate record from offerPrice, which
          // stays exactly as the buyer submitted it.
          price: parsed.value.price,
          paymentTerms: parsed.value.paymentTerms,
          // CONFIRMED: the seller is recording a deal already agreed through
          // manual negotiation, not an offer awaiting a decision.
          status: "CONFIRMED",
        },
        select: {
          id: true,
          quoteRequestId: true,
          quantity: true,
          price: true,
          paymentTerms: true,
          status: true,
          createdAt: true,
        },
      });
    });

    const body: TransactionCreateResponse = {
      transaction: {
        id: created.id,
        quoteRequestId: created.quoteRequestId,
        quantity: created.quantity.toString(),
        price: created.price.toString(),
        paymentTerms: created.paymentTerms,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
    };

    return Response.json(body, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof OfferNotFinalizableError) {
      return conflict("Penawaran ini sudah tidak dapat difinalisasi.");
    }
    // Two admins finalizing at once: the unique constraint wins, the loser sees
    // a clean 409, and no partial or duplicate row is ever left behind.
    if (isUniqueConstraintViolation(error)) {
      return conflict("Penawaran ini sudah memiliki transaksi.");
    }
    return adminInternalErrorResponse();
  }
}
