import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import { combineSpecifications } from "@/lib/coal-specifications";
import { parseListingInput } from "@/lib/listing-input";
import { canTransitionListingStatus } from "@/lib/listing-status";
import type {
  AdminListingDetail,
  AdminListingDetailResponse,
  ListingUpdateResponse,
} from "@/lib/quote-requests";
import { isListingStatus } from "@/lib/quote-requests";

/**
 * Admin Coal Listing detail: read (GET) and edit (PATCH) one listing.
 *
 * The PATCH edits basic information, replaces the flexible specification rows
 * and the media URL references wholesale (the details screen shows exactly
 * what a future save puts back), and - when a status is supplied - moves the
 * listing through the explicit lifecycle in lib/listing-status.ts. Commercial
 * data (offers, transactions) is never writable from here, and a listing has
 * no buyer to assign: lots are shared.
 *
 * Access control is the shared authorizeAdminRequest call and nothing else.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/** A body whose only actionable field is a status (the status-control PATCH). */
function isStatusOnlyPayload(payload: unknown): payload is { status: string } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return (
    record.status !== undefined &&
    record.status !== null &&
    record.title === undefined
  );
}

/**
 * Status-only PATCH: move the listing through the explicit lifecycle in
 * lib/listing-status.ts without touching the other fields. Persists nothing
 * but the status, so a publish / unpublish / sold move can never erase the
 * specifications or media references wholesale.
 */
async function handleStatusOnlyUpdate(id: string, requested: string): Promise<Response> {
  if (!isListingStatus(requested)) {
    return Response.json(
      { error: "Status listing tidak dikenal." },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const current = await prisma.coalListing.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (current === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }
    if (requested === current.status) {
      return Response.json(
        { error: "Listing sudah berada pada status tersebut." },
        { status: 409, headers: NO_STORE },
      );
    }
    if (!canTransitionListingStatus(current.status, requested)) {
      return Response.json(
        { error: "Perubahan status listing tidak valid." },
        { status: 409, headers: NO_STORE },
      );
    }

    const updated = await prisma.coalListing.update({
      where: { id },
      data: { status: requested },
      select: { id: true, status: true, updatedAt: true },
    });

    const body: ListingUpdateResponse = {
      listing: {
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

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/listings/[id]">,
): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

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
        createdAt: true,
        updatedAt: true,
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

    if (row === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    const listing: AdminListingDetail = {
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      specificationCount: row.specifications.length,
      photoCount: row.photos.length,
      coaCount: row.coa.length,
      videoCount: row.videos.length,
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

    const body: AdminListingDetailResponse = { listing };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/listings/[id]">,
): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const { id } = await ctx.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      { error: "Permintaan tidak valid." },
      { status: 400, headers: NO_STORE },
    );
  }

  // The status control on the detail screen sends a minimal { status } body;
  // the edit form always sends the full listing shape. A payload with a status
  // and no title is a status-only move: it must not require the rest of the
  // listing, and its reply is the same guarded lifecycle contract.
  if (isStatusOnlyPayload(rawBody)) {
    return handleStatusOnlyUpdate(id, rawBody.status);
  }

  const parsed = parseListingInput(rawBody, "update");
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE },
    );
  }

  const value = parsed.value;

  try {
    const current = await prisma.coalListing.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (current === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    // The status lifecycle is guarded before anything is persisted: re-applying
    // the current state is a conflict, and SOLD is terminal.
    if (value.status !== null) {
      if (value.status === current.status) {
        return Response.json(
          { error: "Listing sudah berada pada status tersebut." },
          { status: 409, headers: NO_STORE },
        );
      }
      if (!canTransitionListingStatus(current.status, value.status)) {
        return Response.json(
          { error: "Perubahan status listing tidak valid." },
          { status: 409, headers: NO_STORE },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const listing = await tx.coalListing.update({
        where: { id },
        data: {
          title: value.title,
          description: value.description,
          category: value.category,
          coalType: value.coalType,
          typeLabel: value.typeLabel,
          origin: value.origin,
          pricingMode: value.pricingMode,
          quantity: value.quantity,
          ...(value.status === null ? {} : { status: value.status }),
        },
        select: { id: true, status: true, updatedAt: true },
      });

      // Specifications and media references are replaced wholesale: the edit
      // form sends the full desired state, so what is saved is exactly what
      // the admin sees.
      await tx.coalSpecification.deleteMany({ where: { coalListingId: id } });
      if (value.specifications.length > 0) {
        await tx.coalSpecification.createMany({
          data: value.specifications.map((spec) => ({
            coalListingId: id,
            name: spec.name,
            value: spec.value,
            unit: spec.unit,
          })),
        });
      }

      await tx.coalPhoto.deleteMany({ where: { coalListingId: id } });
      if (value.photos.length > 0) {
        await tx.coalPhoto.createMany({
          data: value.photos.map((fileUrl) => ({ coalListingId: id, fileUrl })),
        });
      }

      await tx.cOA.deleteMany({ where: { coalListingId: id } });
      if (value.coas.length > 0) {
        await tx.cOA.createMany({
          data: value.coas.map((fileUrl) => ({ coalListingId: id, fileUrl })),
        });
      }

      await tx.coalVideo.deleteMany({ where: { coalListingId: id } });
      if (value.videos.length > 0) {
        await tx.coalVideo.createMany({
          data: value.videos.map((fileUrl) => ({ coalListingId: id, fileUrl })),
        });
      }

      return listing;
    });

    const body: ListingUpdateResponse = {
      listing: {
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