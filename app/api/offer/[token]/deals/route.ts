import {
  authenticateOfferToken,
  invalidOfferTokenResponse,
  offerInternalErrorResponse,
} from "@/lib/offer-auth";
import { prisma } from "@/lib/prisma";
import type {
  BuyerDealsResponse,
  BuyerOfferSummary,
  BuyerTransactionSummary,
} from "@/lib/buyer-deals";

/**
 * Token-gated "your offers and deal" endpoint.
 *
 * The magic link identifies the BUYER, and this handler returns only rows whose
 * userId matches that buyer - their own offers across the shared listings and
 * the final Transaction (with its price) when one exists. Another buyer with
 * their own link gets their own rows; no one can read someone else's Offer
 * Price or Transaction Price through this endpoint, and there is no way to name
 * a different buyer from the URL.
 *
 * The price shown here is the Transaction price of the buyer's *own* deal,
 * which is exactly who may see it: the transaction's buyer and the admin.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/offer/[token]/deals">,
): Promise<Response> {
  const { token } = await ctx.params;

  let auth: Awaited<ReturnType<typeof authenticateOfferToken>>;
  try {
    auth = await authenticateOfferToken(token);
  } catch {
    return offerInternalErrorResponse();
  }

  if (!auth.ok) {
    return invalidOfferTokenResponse();
  }

  // Scoped by the token's own identity: another buyer's rows are structurally
  // unreachable, not filtered out as an afterthought.
  const { userId } = auth.access;

  try {
    const offerRows = await prisma.quoteRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        quantity: true,
        offerPrice: true,
        paymentTerms: true,
        notes: true,
        coalListing: { select: { title: true } },
        createdAt: true,
      },
    });

    const transactionRow = await prisma.transaction.findFirst({
      where: { quoteRequest: { userId } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        quantity: true,
        price: true,
        paymentTerms: true,
        createdAt: true,
      },
    });

    const offers: BuyerOfferSummary[] = offerRows.map((row) => ({
      id: row.id,
      status: row.status,
      quantity: row.quantity.toString(),
      offerPrice: row.offerPrice?.toString() ?? null,
      paymentTerms: row.paymentTerms,
      notes: row.notes,
      listingTitle: row.coalListing.title,
      createdAt: row.createdAt.toISOString(),
    }));

    let transaction: BuyerTransactionSummary | null = null;
    if (transactionRow !== null) {
      transaction = {
        id: transactionRow.id,
        status: transactionRow.status,
        quantity: transactionRow.quantity.toString(),
        price: transactionRow.price.toString(),
        paymentTerms: transactionRow.paymentTerms,
        createdAt: transactionRow.createdAt.toISOString(),
      };
    }

    const body: BuyerDealsResponse = { offers, transaction };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return offerInternalErrorResponse();
  }
}