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
  AdminBuyerListResponse,
  AdminBuyerListItem,
  BuyerCreateResponse,
} from "@/lib/quote-requests";

/**
 * Admin Buyer management: list (GET) and create (POST).
 *
 * Buyers are User rows whose role is always BUYER. The create form is the
 * minimal identity form (Company Name, Contact Name, Phone, Email, Status) and
 * the role is delivered by the server, never by the client: parseBuyerInput
 * rejects any payload that tries to create an ADMIN through this interface.
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
    const where = { role: "BUYER" as const };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        // Newest first; the id breaks ties for a stable order.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_ROWS,
        select: {
          id: true,
          companyName: true,
          name: true,
          phone: true,
          email: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const buyers: AdminBuyerListItem[] = rows.map((row) => ({
      id: row.id,
      companyName: row.companyName,
      name: row.name,
      phone: row.phone,
      email: row.email,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));

    const body: AdminBuyerListResponse = {
      buyers,
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
    // The unique email is guarded up front: @prisma/client cannot be relied on
    // to surface a clean P2002 (its error serialisation may crash instead), so
    // the duplicate is detected before the insert and answered as a 409.
    const existingEmail = await prisma.user.findUnique({
      where: { email: parsed.value.email },
      select: { id: true },
    });
    if (existingEmail !== null) {
      return Response.json(
        { error: "Pembeli dengan email ini sudah ada." },
        { status: 409, headers: NO_STORE },
      );
    }

    const created = await prisma.user.create({
      data: {
        companyName: parsed.value.companyName,
        name: parsed.value.name,
        phone: parsed.value.phone,
        email: parsed.value.email,
        // The role is forced server-side; this endpoint can never create an ADMIN.
        role: "BUYER",
        status: parsed.value.status,
      },
      select: {
        id: true,
        companyName: true,
        name: true,
        phone: true,
        email: true,
        status: true,
      },
    });

    const body: BuyerCreateResponse = {
      buyer: {
        id: created.id,
        companyName: created.companyName,
        name: created.name,
        phone: created.phone,
        email: created.email,
        status: created.status,
      },
    };
    return Response.json(body, { status: 201, headers: NO_STORE });
  } catch (error) {
    // Unique email: surface the collision as a 409, never a raw constraint error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json(
        { error: "Pembeli dengan email ini sudah ada." },
        { status: 409, headers: NO_STORE },
      );
    }
    return adminInternalErrorResponse();
  }
}