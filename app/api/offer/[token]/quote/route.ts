import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  authenticateOfferToken,
  invalidOfferTokenResponse,
  offerInternalErrorResponse,
} from "@/lib/offer-auth";
import { parseBuyerOffer } from "@/lib/buyer-offer";
import { getNotificationService } from "@/lib/notifications";

/**
 * Buyer offer submission.
 *
 * The buyer-wide link identifies the BUYER; the buyer picks the listing. The
 * request therefore carries the buyer's chosen `listingId` plus the offer
 * terms, and the server validates that listing against the database before
 * creating the QuoteRequest. `userId` is never read from the body - it comes
 * from the AccessToken the magic link resolves to - and the parser rejects any
 * body that tries to set server-controlled fields (userId / status /
 * transactionId). listingId is NOT rejected just because it is client-supplied:
 * it is the buyer's own selection, and the server's job is to verify it, not to
 * ignore it. Every read and write goes through the Prisma client, i.e.
 * parameterised queries.
 *
 * This is the buyer's INITIAL offer. Negotiation is manual (WhatsApp/phone)
 * and lives outside the system; the final agreed price is recorded later on the
 * Transaction and stays a separate concept from offerPrice.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400, headers: NO_STORE });
}

function notFound(): Response {
  return Response.json(
    { error: "Data tidak ditemukan." },
    { status: 404, headers: NO_STORE },
  );
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/offer/[token]/quote">,
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Permintaan tidak valid.");
  }

  const parsed = parseBuyerOffer(payload);
  if (!parsed.ok) {
    return badRequest(parsed.error);
  }

  // The buyer's picked listing is resolved and verified server-side: it must
  // exist, must be buyer-visible (not DRAFT), and must be available for offers
  // (PUBLISHED). The requested tonnage is checked against the quantity the
  // buyer was actually shown on that listing.
  let listing: {
    id: string;
    title: string;
    quantity: Prisma.Decimal | null;
    status: string;
  };
  try {
    const row = await prisma.coalListing.findUnique({
      where: { id: parsed.value.listingId },
      select: { id: true, title: true, quantity: true, status: true },
    });
    if (row === null || row.status === "DRAFT") {
      // DRAFT lots do not exist publicly: same 404 as an unknown id.
      return notFound();
    }
    if (row.status !== "PUBLISHED") {
      return badRequest("Listing ini sedang tidak tersedia untuk penawaran.");
    }
    listing = row;
  } catch {
    return offerInternalErrorResponse();
  }

  if (listing.quantity === null) {
    return badRequest("Lot ini tidak memiliki kuantitas tersedia.");
  }
  if (parsed.value.quantity > Number(listing.quantity)) {
    return badRequest("Kuantitas melebihi jumlah yang tersedia.");
  }

  try {
    const created = await prisma.quoteRequest.create({
      data: {
        // Server-derived: the buyer is whoever the link authenticates.
        userId: auth.access.userId,
        // Server-validated: the buyer's pick, checked against the database.
        coalListingId: listing.id,
        quantity: parsed.value.quantity,
        // The buyer's initial proposal, DECIMAL(14,2). Distinguished from
        // Transaction.price, which is the final agreed price.
        offerPrice: parsed.value.offerPrice,
        paymentTerms: parsed.value.paymentTerms,
        notes: parsed.value.notes,
        status: "PENDING",
      },
      // Only what the buyer needs to see, never the internal relations.
      select: { id: true, status: true, offerPrice: true, createdAt: true },
    });

    // Notification boundary. No WhatsApp provider is configured yet, so the
    // service honestly reports "not delivered" and the response never claims
    // otherwise. Delivery is best-effort: a future provider that throws must
    // not turn a stored offer into an error reply.
    try {
      await getNotificationService().buyerOfferCreated({
        kind: "BUYER_OFFER_CREATED",
        quoteRequestId: created.id,
        quantity: parsed.value.quantity.toString(),
        offerPrice: parsed.value.offerPrice.toString(),
        paymentTerms: parsed.value.paymentTerms,
        listingTitle: listing.title,
        companyName: auth.access.user.companyName,
      });
    } catch {
      // Swallow: the offer itself is already stored.
    }

    return Response.json(
      {
        quoteRequest: {
          id: created.id,
          status: created.status,
          offerPrice: created.offerPrice?.toString() ?? null,
          createdAt: created.createdAt,
        },
      },
      { status: 201 },
    );
  } catch {
    return offerInternalErrorResponse();
  }
}