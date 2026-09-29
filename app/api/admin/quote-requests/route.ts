import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import {
  isQuoteRequestStatus,
  type QuoteRequestListResponse,
} from "@/lib/quote-requests";

/**
 * Read-only list of buyer offers (quote requests) for the admin area.
 *
 * Lives in its own /api/admin namespace: it never accepts an AccessToken, so a
 * buyer magic link is neither required nor accepted as authorisation here. All
 * access control funnels through authorizeAdminRequest, and no AccessToken
 * columns are selected, so token hashes cannot leak through this payload.
 *
 * Read-only by design: there is no POST, PATCH, or DELETE in this folder, and
 * the only way a status changes today is directly in the database.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Upper bound on rows returned per request so an admin screen cannot pull an
 * unbounded table into memory. The response reports `total` and `hasMore` so
 * the UI can say so rather than implying the list is complete.
 */
const MAX_ROWS = 100;

export async function GET(request: NextRequest): Promise<Response> {
  // Authorisation first, so an unauthenticated caller learns nothing about
  // which status values exist.
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const requested = request.nextUrl.searchParams.get("status");
  if (requested !== null && !isQuoteRequestStatus(requested)) {
    return Response.json(
      { error: "Filter status tidak valid." },
      { status: 400, headers: NO_STORE },
    );
  }
  const status = requested;

  try {
    const where = status === null ? {} : { status };

    const [rows, total] = await Promise.all([
      prisma.quoteRequest.findMany({
        where,
        // Newest first. The id breaks ties so rows sharing a timestamp keep a
        // stable order across requests and any future pagination.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_ROWS,
        select: {
          id: true,
          status: true,
          quantity: true,
          offerPrice: true,
          paymentTerms: true,
          createdAt: true,
          // Contact details stay in the detail endpoint.
          user: { select: { companyName: true, name: true } },
          coalListing: { select: { id: true, title: true } },
        },
      }),
      prisma.quoteRequest.count({ where }),
    ]);

    const body: QuoteRequestListResponse = {
      quoteRequests: rows.map((row) => ({
        id: row.id,
        status: row.status,
        quantity: row.quantity.toString(),
        offerPrice: row.offerPrice?.toString() ?? null,
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