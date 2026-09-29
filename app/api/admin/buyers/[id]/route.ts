import type { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  adminAuthErrorResponse,
  adminInternalErrorResponse,
  authorizeAdminRequest,
} from "@/lib/admin/authorize";
import { parseBuyerInput } from "@/lib/buyer-input";
import type {
  AdminBuyerDetailResponse,
  AdminBuyerProfile,
  BuyerUpdateResponse,
} from "@/lib/quote-requests";

/**
 * Admin Buyer detail: read (GET) and update (PATCH) one buyer.
 *
 * GET is the only admin endpoint that returns a buyer's private record counts
 * (links issued, offers, transactions) alongside the identity. PATCH edits the
 * minimal identity fields plus Status; the role column is never writable here,
 * so this surface can never promote a buyer to ADMIN.
 *
 * Access control is the shared authorizeAdminRequest call and nothing else.
 */

// Prisma's pg driver requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/buyers/[id]">,
): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const { id } = await ctx.params;

  try {
    // Scoped by role: an ADMIN user is not a Buyer and is not reachable here.
    const row = await prisma.user.findFirst({
      where: { id, role: "BUYER" },
      select: {
        id: true,
        companyName: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { accessTokens: true, quoteRequests: true },
        },
      },
    });

    if (row === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    const transactionCount = await prisma.transaction.count({
      where: { quoteRequest: { userId: row.id } },
    });

    const buyer: AdminBuyerProfile = {
      id: row.id,
      companyName: row.companyName,
      name: row.name,
      phone: row.phone,
      email: row.email,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      accessLinkCount: row._count.accessTokens,
      offerCount: row._count.quoteRequests,
      transactionCount,
    };

    const body: AdminBuyerDetailResponse = { buyer };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return adminInternalErrorResponse();
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/buyers/[id]">,
): Promise<Response> {
  const auth = await authorizeAdminRequest(request);
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status);
  }

  const { id } = await ctx.params;

  let parsed: ReturnType<typeof parseBuyerInput>;
  try {
    parsed = parseBuyerInput(await request.json());
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

  try {
    const existing = await prisma.user.findFirst({
      where: { id, role: "BUYER" },
      select: { id: true },
    });
    if (existing === null) {
      return Response.json(
        { error: "Data tidak ditemukan." },
        { status: 404, headers: NO_STORE },
      );
    }

    // Guard the unique email up front (the client's error serialisation is not
    // reliable enough to answer a duplicate as a clean 409 from a P2002).
    const emailInUse = await prisma.user.findFirst({
      where: { email: parsed.value.email, id: { not: id } },
      select: { id: true },
    });
    if (emailInUse !== null) {
      return Response.json(
        { error: "Pembeli dengan email ini sudah ada." },
        { status: 409, headers: NO_STORE },
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        companyName: parsed.value.companyName,
        name: parsed.value.name,
        phone: parsed.value.phone,
        email: parsed.value.email,
        // Status is editable (activate / deactivate a buyer); role is not.
        status: parsed.value.status,
      },
      select: {
        id: true,
        companyName: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        updatedAt: true,
      },
    });

    const body: BuyerUpdateResponse = {
      buyer: {
        id: updated.id,
        companyName: updated.companyName,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json(
        { error: "Pembeli dengan email ini sudah ada." },
        { status: 409, headers: NO_STORE },
      );
    }
    return adminInternalErrorResponse();
  }
}