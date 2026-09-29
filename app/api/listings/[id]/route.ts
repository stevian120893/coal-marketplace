import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  combineSpecifications,
} from "@/lib/coal-specifications";
import {
  isVisibleListingStatus,
  type PublicListingDetail,
  type PublicListingDetailResponse,
} from "@/lib/listing-catalog";

/**
 * Shared listing detail (public, no auth).
 *
 * One coal lot rendered without a token: the same listing-level presentation
 * the buyer sees through a magic link (specs, COA, photos, videos), with no
 * Buyer Offer price, no Transaction price, and no buyer identity. DRAFT lots
 * are 404 - they do not exist in the public catalog until published; SOLD lots
 * stay visible with their Sold state so past listings remain legible.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/listings/[id]">,
): Promise<Response> {
  const { id } = await ctx.params;

  try {
    const row = await prisma.coalListing.findUnique({
      where: { id },
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
        // The legacy fixed columns are the transitional backfill source; the
        // canonical read path is the flexible specification rows below.
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

    if (row === null || !isVisibleListingStatus(row.status)) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    const listing: PublicListingDetail = {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      coalType: row.coalType,
      typeLabel: row.typeLabel,
      origin: row.origin,
      pricingMode: row.pricingMode,
      quantity: row.quantity?.toString() ?? null,
      status: row.status,
      // Flexible specifications, with the legacy fixed columns merged in for
      // listings that predate the flexible model. No listing price is exposed.
      specifications: combineSpecifications(
        {
          gar: row.gar?.toString() ?? null,
          tm: row.tm?.toString() ?? null,
          ash: row.ash?.toString() ?? null,
          sulfur: row.sulfur?.toString() ?? null,
        },
        row.specifications,
      ),
      photos: row.photos.map((photo) => photo.fileUrl),
      coas: row.coa.map((coa) => coa.fileUrl),
      videos: row.videos.map((video) => video.fileUrl),
    };

    const body: PublicListingDetailResponse = { listing };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return Response.json(
      { error: "Terjadi kesalahan pada server." },
      { status: 500, headers: NO_STORE },
    );
  }
}