import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { transactionStatusLabel } from "@/app/admin/quote-requests/format";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import { combineSpecifications } from "@/lib/coal-specifications";
import {
  canTransitionTransactionStatus,
  parseTransactionStatusUpdate,
} from "@/lib/transaction-status";
import type {
  AdminTransactionDetailResponse,
  TransactionStatusUpdateResponse,
} from "@/lib/quote-requests";

/**
 * Transaction management for one deal: read-only detail (GET) plus a
 * status-only update (PATCH).
 *
 * A Transaction is the final agreed deal. It carries the agreed quantity,
 * price, and payment terms - a record deliberately separate from the buyer's
 * historical offer, which is read from the same quoteRequest relation and
 * exposed as `sourceOffer` without ever being editable here.
 *
 * GET returns exactly the four groups the admin detail view renders: the
 * transaction itself, the trusted buyer record, the listing summary with its
 * flexible specifications, and the source Buyer Offer summary. No AccessToken
 * relation is selected, so hashes and revocation state stay unreachable.
 *
 * PATCH changes status only. Nothing else - price, quantity, paymentTerms,
 * userId, coalListingId, quoteRequestId - is ever accepted or written, and
 * every transition is checked against the explicit lifecycle in
 * lib/transaction-status.ts.
 *
 * Access control is the shared authorizeAdminRequest call and nothing else.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/transactions/[id]">,
): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const { id } = await ctx.params;

  try {
    const row = await prisma.transaction.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        quantity: true,
        price: true,
        paymentTerms: true,
        createdAt: true,
        updatedAt: true,
        // The historical Buyer Offer this deal came from, with the trusted
        // buyer and listing records reached through it.
        quoteRequest: {
          select: {
            id: true,
            status: true,
            quantity: true,
            offerPrice: true,
            paymentTerms: true,
            createdAt: true,
            user: {
              select: { companyName: true, name: true, phone: true, email: true },
            },
            coalListing: {
              select: {
                id: true,
                title: true,
                description: true,
                category: true,
                coalType: true,
                typeLabel: true,
                origin: true,
                pricingMode: true,
                gar: true,
                tm: true,
                ash: true,
                sulfur: true,
                quantity: true,
                specifications: {
                  select: { name: true, value: true, unit: true },
                  orderBy: [{ createdAt: "asc" }, { name: "asc" }],
                },
              },
            },
          },
        },
      },
    });

    if (!row) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    const offer = row.quoteRequest;
    const body: AdminTransactionDetailResponse = {
      transaction: {
        id: row.id,
        price: row.price.toString(),
        quantity: row.quantity.toString(),
        paymentTerms: row.paymentTerms,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      buyer: {
        companyName: offer.user.companyName,
        name: offer.user.name,
        phone: offer.user.phone,
        email: offer.user.email,
      },
      coalListing: {
        id: offer.coalListing.id,
        title: offer.coalListing.title,
        description: offer.coalListing.description,
        category: offer.coalListing.category,
        coalType: offer.coalListing.coalType,
        typeLabel: offer.coalListing.typeLabel,
        origin: offer.coalListing.origin,
        pricingMode: offer.coalListing.pricingMode,
        quantity: offer.coalListing.quantity?.toString() ?? null,
        specifications: combineSpecifications(
          {
            gar: offer.coalListing.gar?.toString() ?? null,
            tm: offer.coalListing.tm?.toString() ?? null,
            ash: offer.coalListing.ash?.toString() ?? null,
            sulfur: offer.coalListing.sulfur?.toString() ?? null,
          },
          offer.coalListing.specifications,
        ),
      },
      sourceOffer: {
        id: offer.id,
        status: offer.status,
        quantity: offer.quantity.toString(),
        // The buyer's original proposal - deliberately separate from the
        // Transaction price, which is the final agreed price.
        offerPrice: offer.offerPrice?.toString() ?? null,
        paymentTerms: offer.paymentTerms,
        createdAt: offer.createdAt.toISOString(),
      },
    };

    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}

/**
 * Status-only update for one Transaction.
 *
 * The only writable column is `status`, and every transition is checked
 * against the explicit lifecycle in lib/transaction-status.ts
 * (CONFIRMED -> PROCESSING -> COMPLETED, with CANCELLED reachable from
 * CONFIRMED and PROCESSING; COMPLETED and CANCELLED are terminal).
 *
 * Malformed JSON, non-object bodies, unknown statuses, and unknown
 * Transaction ids are all rejected before any write. A transition that is not
 * allowed for the current status (or a no-op re-application of the same
 * status) answers 409 Conflict.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/transactions/[id]">,
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

  const parsed = parseTransactionStatusUpdate(payload);
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const current = await prisma.transaction.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (current === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    if (current.status === parsed.status) {
      return Response.json(
        { error: `Transaksi ini sudah berstatus ${transactionStatusLabel(parsed.status)}.` },
        { status: 409, headers: NO_STORE },
      );
    }
    if (!canTransitionTransactionStatus(current.status, parsed.status)) {
      return Response.json(
        {
          error: `Status transaksi tidak dapat diubah dari ${transactionStatusLabel(current.status)} ke ${transactionStatusLabel(parsed.status)}.`,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    // Write status only. The guarded where clause turns a simultaneous change
    // by another admin into a 409 instead of a silent overwrite.
    const result = await prisma.transaction.updateMany({
      where: { id, status: current.status },
      data: { status: parsed.status },
    });
    if (result.count === 0) {
      return Response.json(
        {
          error: "Status transaksi sudah berubah. Muat ulang dan coba lagi.",
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const updated = await prisma.transaction.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, updatedAt: true },
    });

    const body: TransactionStatusUpdateResponse = {
      transaction: {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}