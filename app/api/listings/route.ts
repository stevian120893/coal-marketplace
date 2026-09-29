import { prisma } from "@/lib/prisma";
import {
  VISIBLE_LISTING_STATUSES,
  type PublicListingListResponse,
  type PublicListingSummary,
} from "@/lib/listing-catalog";

/**
 * Shared buyer listing catalog (public, no auth).
 *
 * Coal Listings are shared commercial listings viewed by many buyers, so this
 * endpoint needs no token and carries only listing-level data: title, category,
 * coal type, origin, quantity, pricing mode, and status. It never exposes a
 * Buyer Offer price, a Transaction price, or any buyer identity - those are
 * private and live on the admin surface or the token-gated deals endpoint.
 *
 * Only PUBLISHED and SOLD lots are listed; DRAFT lots are invisible until the
 * admin publishes them.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const MAX_ROWS = 100;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    const rows = await prisma.coalListing.findMany({
      where: { status: { in: [...VISIBLE_LISTING_STATUSES] } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: MAX_ROWS,
      select: {
        id: true,
        title: true,
        category: true,
        coalType: true,
        typeLabel: true,
        origin: true,
        pricingMode: true,
        quantity: true,
        status: true,
      },
    });

    const listings: PublicListingSummary[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      coalType: row.coalType,
      typeLabel: row.typeLabel,
      origin: row.origin,
      pricingMode: row.pricingMode,
      // Decimal serialised as a string so no precision is lost in JSON.
      quantity: row.quantity?.toString() ?? null,
      status: row.status,
    }));

    const body: PublicListingListResponse = {
      listings,
      total: listings.length,
      hasMore: rows.length === MAX_ROWS,
    };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return Response.json(
      { error: "Terjadi kesalahan pada server." },
      { status: 500, headers: NO_STORE },
    );
  }
}