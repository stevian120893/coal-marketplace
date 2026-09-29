import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { statusLabel } from "@/app/admin/quote-requests/format";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import { combineSpecifications } from "@/lib/coal-specifications";
import {
  canTransitionOfferStatus,
  parseOfferStatusUpdate,
} from "@/lib/offer-status";
import type {
  QuoteRequestDetailResponse,
  QuoteRequestStatusUpdateResponse,
} from "@/lib/quote-requests";

/**
 * Buyer offer management for one offer: read-only detail (GET) plus a
 * status-only update (PATCH).
 *
 * GET is the only admin endpoint that returns the buyer's phone and email.
 * It is scoped by primary key alone, never by a buyer token, and returns
 * exactly the three groups the admin detail view renders: buyer, coal, and
 * offer. No AccessToken relation is selected, so no token hash, expiry, or
 * revocation state is reachable from here.
 *
 * Access control is the shared authorizeAdminRequest call and nothing else; the
 * rule that grants it lives in lib/admin/authorize.ts.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/quote-requests/[id]">,
): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const { id } = await ctx.params;

  try {
    const row = await prisma.quoteRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        quantity: true,
        offerPrice: true,
        paymentTerms: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { companyName: true, name: true, phone: true, email: true } },
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
        transaction: {
          select: {
            id: true,
            quantity: true,
            price: true,
            paymentTerms: true,
            status: true,
            createdAt: true,
            updatedAt: true,
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

    const body: QuoteRequestDetailResponse = {
      quoteRequest: {
        id: row.id,
        status: row.status,
        quantity: row.quantity.toString(),
        offerPrice: row.offerPrice?.toString() ?? null,
        paymentTerms: row.paymentTerms,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        buyer: {
          companyName: row.user.companyName,
          name: row.user.name,
          phone: row.user.phone,
          email: row.user.email,
        },
        coalListing: {
          id: row.coalListing.id,
          title: row.coalListing.title,
          description: row.coalListing.description,
          category: row.coalListing.category,
          coalType: row.coalListing.coalType,
          typeLabel: row.coalListing.typeLabel,
          origin: row.coalListing.origin,
          pricingMode: row.coalListing.pricingMode,
          quantity: row.coalListing.quantity?.toString() ?? null,
          specifications: combineSpecifications(
            {
              gar: row.coalListing.gar?.toString() ?? null,
              tm: row.coalListing.tm?.toString() ?? null,
              ash: row.coalListing.ash?.toString() ?? null,
              sulfur: row.coalListing.sulfur?.toString() ?? null,
            },
            row.coalListing.specifications,
          ),
        },
        transaction:
          row.transaction === null
            ? null
            : {
                id: row.transaction.id,
                price: row.transaction.price.toString(),
                quantity: row.transaction.quantity.toString(),
                paymentTerms: row.transaction.paymentTerms,
                status: row.transaction.status,
                createdAt: row.transaction.createdAt.toISOString(),
                updatedAt: row.transaction.updatedAt.toISOString(),
              },
      },
    };

    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}

/**
 * Status-only update for a buyer offer.
 *
 * The only writable column is `status`, and every transition is checked against
 * the explicit lifecycle in lib/offer-status.ts. The request never carries a
 * buyer identity or listing: the endpoint is scoped by the offer id alone, and
 * everything the buyer submitted (quantity, offerPrice, paymentTerms, notes) is
 * out of reach here - so the buyer's original proposal is preserved exactly as
 * submitted, and accepting an offer never creates a Transaction.
 *
 * Malformed JSON, non-object bodies, unknown statuses, and unknown offer ids
 * are all rejected before any write. A transition that is not allowed for the
 * offer's current status (or a no-op re-application of the same status)
 * answers 409 Conflict.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/quote-requests/[id]">,
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

  const parsed = parseOfferStatusUpdate(payload);
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const current = await prisma.quoteRequest.findUnique({
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
        { error: `Penawaran ini sudah berstatus ${statusLabel(parsed.status)}.` },
        { status: 409, headers: NO_STORE },
      );
    }
    if (!canTransitionOfferStatus(current.status, parsed.status)) {
      return Response.json(
        {
          error: `Status penawaran tidak dapat diubah dari ${statusLabel(current.status)} ke ${statusLabel(parsed.status)}.`,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    // Write status only. The guarded where clause turns a simultaneous change
    // by another admin into a 409 instead of a silent overwrite.
    const result = await prisma.quoteRequest.updateMany({
      where: { id, status: current.status },
      data: { status: parsed.status },
    });
    if (result.count === 0) {
      return Response.json(
        { error: "Status penawaran sudah berubah. Muat ulang dan coba lagi." },
        { status: 409, headers: NO_STORE },
      );
    }

    const updated = await prisma.quoteRequest.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, updatedAt: true },
    });

    const body: QuoteRequestStatusUpdateResponse = {
      quoteRequest: {
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