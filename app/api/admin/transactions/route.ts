import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import {
  isTransactionStatus,
  type TransactionListResponse,
} from "@/lib/quote-requests";

/**
 * Read-only list of final Transactions for the admin area.
 *
 * Mirrors the buyer offer list: same auth entry point, same status-filter
 * contract, same ordering (newest first with an id tiebreaker), same row cap,
 * and the same policy of keeping contact details (phone, email) out of the
 * list payload - they belong to the detail view only.
 *
 * The Transaction price is the final agreed price and travels in this list;
 * the buyer's original Offer Price never does. No AccessToken columns are
 * selected, so token hashes cannot leak.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/** Upper bound on rows, matching the buyer offer list. */
const MAX_ROWS = 100;

export async function GET(request: NextRequest): Promise<Response> {
  // Authorisation first, so an unauthenticated caller learns nothing about
  // which status values exist.
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const requested = request.nextUrl.searchParams.get("status");
  if (requested !== null && !isTransactionStatus(requested)) {
    return Response.json(
      { error: "Filter status tidak valid." },
      { status: 400, headers: NO_STORE },
    );
  }
  const status = requested;

  try {
    const where = status === null ? {} : { status };

    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        // Newest first. The id breaks ties so rows sharing a timestamp keep a
        // stable order across requests and any future pagination.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_ROWS,
        select: {
          id: true,
          status: true,
          quantity: true,
          price: true,
          paymentTerms: true,
          createdAt: true,
          // Contact details stay in the detail endpoint.
          user: { select: { companyName: true, name: true } },
          coalListing: { select: { id: true, title: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    const body: TransactionListResponse = {
      transactions: rows.map((row) => ({
        id: row.id,
        status: row.status,
        quantity: row.quantity.toString(),
        price: row.price.toString(),
        paymentTerms: row.paymentTerms,
        createdAt: row.createdAt.toISOString(),
        buyer: {
          companyName: row.user.companyName,
          name: row.user.name,
        },
        coalListing: {
          id: row.coalListing.id,
          title: row.coalListing.title,
        },
      })),
      filter: { status },
      total,
      hasMore: total > rows.length,
    };

    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}