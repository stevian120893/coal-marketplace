import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashOfferToken } from "@/lib/offer-auth";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import { apiBaseUrl } from "@/lib/api-url";
import {
  ACCESS_TOKEN_TTL_DAYS,
  buyerSlug,
  generateRawAccessToken,
  buildBuyerOfferUrl,
} from "@/lib/access-links";
import type { AccessLinkCreateResponse } from "@/lib/quote-requests";

/**
 * Buyer-wide access link generation.
 *
 * One link identifies one BUYER across every shared listing -
 * https://<domain>/offer/<buyer-slug>-<raw-secret> - so the buyer can browse
 * the whole catalog and choose which listing to make an offer on. There is no
 * listing selector here: the seller issues a link to a buyer, and the buyer
 * does the selecting on the offer page.
 *
 * The response contains the personalized link so the admin can copy or open
 * it; the database stores only the SHA-256 hash of the secret. The raw secret
 * is a bearer credential: it is never stored, logged, or echoed elsewhere, and
 * the API never returns a tokenHash.
 *
 * Link reuse follows the AccessToken semantics: issuing a new link must never
 * silently invalidate a still-valid one. A fresh token is minted on every
 * generation so the admin always gets a copyable URL, while any earlier link
 * for the same buyer keeps working until it expires or is revoked.
 *
 * Access control is the shared authorizeAdminRequest call and nothing else.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400, headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Permintaan tidak valid.");
  }
  if (typeof body !== "object" || body === null) {
    return badRequest("Permintaan tidak valid.");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.userId !== "string" || record.userId.length === 0) {
    return badRequest("Pembeli wajib diisi.");
  }
  const userId = record.userId;

  try {
    const buyer = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, companyName: true, name: true },
    });

    if (buyer === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }
    if (buyer.role !== "BUYER") {
      return badRequest("Tautan akses hanya dapat dibuat untuk pembeli.");
    }
    if (buyer.status !== "ACTIVE") {
      return badRequest(
        "Tautan akses tidak dapat dibuat untuk pembeli yang tidak aktif.",
      );
    }

    // Mint a fresh raw secret; the old one (if any) stays valid - issuing a
    // second link must never silently break a link the buyer already has.
    const rawSecret = generateRawAccessToken();
    const slug = buyerSlug(buyer.name) ?? buyerSlug(buyer.companyName) ?? "buyer";
    const expiresAt = new Date(
      Date.now() + ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    // New tokens are buyer-wide: no coalListingId is stored. The buyer picks
    // the listing on the offer page.
    const created = await prisma.accessToken.create({
      data: {
        userId,
        tokenHash: hashOfferToken(rawSecret),
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });

    const baseUrl = await apiBaseUrl();
    const updated: AccessLinkCreateResponse = {
      accessLink: {
        id: created.id,
        url: buildBuyerOfferUrl(baseUrl, slug, rawSecret),
        expiresAt: created.expiresAt.toISOString(),
        buyer: {
          id: buyer.id,
          companyName: buyer.companyName,
          name: buyer.name,
        },
      },
    };
    return Response.json(updated, { status: 201, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}