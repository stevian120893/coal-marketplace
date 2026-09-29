import { prisma } from "@/lib/prisma";
import {
  authenticateOfferToken,
  invalidOfferTokenResponse,
  offerInternalErrorResponse,
} from "@/lib/offer-auth";
import {
  combineSpecifications,
  type SpecificationRow,
} from "@/lib/coal-specifications";
import { VISIBLE_LISTING_STATUSES } from "@/lib/listing-catalog";

/**
 * Buyer-facing endpoint behind the personalized buyer link.
 *
 * The link identifies the BUYER, not a listing: the buyer opens one link and
 * browses every published (or sold) listing in the shared catalog, choosing
 * which one to make an offer on. This handler therefore returns the buyer's
 * identity plus the list of buyer-visible listings.
 *
 * The URL carries the raw secret; only its SHA-256 hash is ever stored or
 * compared, so the raw value is never written to the database or the logs.
 * Token validation is shared with the quote and deals endpoints via
 * @/lib/offer-auth.
 *
 * The magic link is a bearer credential. This handler is dynamic (Route
 * Handlers are uncached by default) so a token-gated response can never be
 * captured in a shared cache.
 *
 * No price is exposed: listings are negotiable by default, so the buyer sees
 * the lot and submits an offer rather than a fixed price. Only listing-level
 * facts are returned - never another buyer's offer or Transaction price.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

/** Coal fields the buyer's page renders for one listing. */
type OfferListing = {
  id: string;
  status: string;
  title: string;
  description: string | null;
  category: string | null;
  coalType: string | null;
  typeLabel: string | null;
  origin: string | null;
  pricingMode: string | null;
  quantity: string | null;
  specifications: SpecificationRow[];
  /** Asset locations only; ids and upload metadata are never exposed. */
  photos: string[];
  coas: string[];
  videos: string[];
};

/** The buyer the link was issued to. No ids and no contact details. */
type OfferBuyer = {
  companyName: string | null;
  name: string | null;
};

type OfferResponse = {
  buyer: OfferBuyer;
  listings: OfferListing[];
};

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/offer/[token]">,
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

  try {
    // Buyer-visible listing set: PUBLISHED for offers, SOLD stays visible with
    // its Sold state made clear, DRAFT never appears.
    const rows = await prisma.coalListing.findMany({
      where: { status: { in: [...VISIBLE_LISTING_STATUSES] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        coalType: true,
        typeLabel: true,
        origin: true,
        pricingMode: true,
        quantity: true,
        status: true,
        // The legacy fixed columns are merged in under the flexible model.
        gar: true,
        tm: true,
        ash: true,
        sulfur: true,
        specifications: {
          select: { name: true, value: true, unit: true },
          orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        },
        photos: { select: { fileUrl: true }, orderBy: { createdAt: "asc" } },
        coa: { select: { fileUrl: true }, orderBy: { uploadedAt: "asc" } },
        videos: { select: { fileUrl: true }, orderBy: { createdAt: "asc" } },
      },
    });

    const listings: OfferListing[] = rows.map((listing) => ({
      id: listing.id,
      status: listing.status,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      coalType: listing.coalType,
      typeLabel: listing.typeLabel,
      origin: listing.origin,
      pricingMode: listing.pricingMode,
      // Decimal columns are serialised as strings so no precision is lost.
      quantity: listing.quantity?.toString() ?? null,
      specifications: combineSpecifications(
        {
          gar: listing.gar?.toString() ?? null,
          tm: listing.tm?.toString() ?? null,
          ash: listing.ash?.toString() ?? null,
          sulfur: listing.sulfur?.toString() ?? null,
        },
        listing.specifications,
      ),
      photos: listing.photos.map((photo) => photo.fileUrl),
      coas: listing.coa.map((coa) => coa.fileUrl),
      videos: listing.videos.map((video) => video.fileUrl),
    }));

    const body: OfferResponse = {
      buyer: {
        companyName: auth.access.user.companyName,
        name: auth.access.user.name,
      },
      listings,
    };
    return Response.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return offerInternalErrorResponse();
  }
}