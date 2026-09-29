import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import { parseListingInput } from "@/lib/listing-input";
import type {
  AdminListingListItem,
  AdminListingListResponse,
  ListingCreateResponse,
} from "@/lib/quote-requests";

/**
 * Admin Coal Listing management: list (GET) and create (POST).
 *
 * A listing is a shared commercial lot, never buyer-owned: there is no buyer
 * selector here and no buyer column on the listing. The create form carries
 * basic information, flexible CoalSpecification rows, and media URL references
 * (photos / COA / videos - direct URLs only; there is no upload or object
 * storage pipeline). New listings always start as DRAFT and only become
 * visible in the shared buyer catalog once published.
 *
 * Access control is the shared authorizeAdminRequest call and nothing else.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_ROWS = 100;

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.coalListing.findMany({
        // Newest first; the id breaks ties for a stable order.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { specifications: true, photos: true, coa: true, videos: true },
          },
        },
      }),
      prisma.coalListing.count(),
    ]);

    const listings: AdminListingListItem[] = rows.map((row) => ({
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      specificationCount: row._count.specifications,
      photoCount: row._count.photos,
      coaCount: row._count.coa,
      videoCount: row._count.videos,
    }));

    const body: AdminListingListResponse = {
      listings,
      total,
      hasMore: total > rows.length,
    };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  let parsed: ReturnType<typeof parseListingInput>;
  try {
    parsed = parseListingInput(await request.json(), "create");
  } catch {
    return Response.json(
      { error: "Permintaan tidak valid." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE },
    );
  }

  const value = parsed.value;

  try {
    const created = await prisma.$transaction(async (tx) => {
      // The server owns the create status: a new listing is always DRAFT,
      // even if a client sneaks a status into the body.
      const listing = await tx.coalListing.create({
        data: {
          title: value.title,
          description: value.description,
          category: value.category,
          coalType: value.coalType,
          typeLabel: value.typeLabel,
          origin: value.origin,
          pricingMode: value.pricingMode,
          quantity: value.quantity,
          status: "DRAFT",
        },
        select: { id: true, status: true },
      });

      if (value.specifications.length > 0) {
        await tx.coalSpecification.createMany({
          data: value.specifications.map((spec) => ({
            coalListingId: listing.id,
            name: spec.name,
            value: spec.value,
            unit: spec.unit,
          })),
        });
      }
      if (value.photos.length > 0) {
        await tx.coalPhoto.createMany({
          data: value.photos.map((fileUrl) => ({ coalListingId: listing.id, fileUrl })),
        });
      }
      if (value.coas.length > 0) {
        await tx.cOA.createMany({
          data: value.coas.map((fileUrl) => ({ coalListingId: listing.id, fileUrl })),
        });
      }
      if (value.videos.length > 0) {
        await tx.coalVideo.createMany({
          data: value.videos.map((fileUrl) => ({ coalListingId: listing.id, fileUrl })),
        });
      }
      return listing;
    });

    const body: ListingCreateResponse = {
      listing: { id: created.id, status: created.status },
    };
    return Response.json(body, { status: 201, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}