import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { splitOfferPath } from "@/lib/offer-link";

/**
 * Shared authentication for the buyer offer flow.
 *
 * The raw secret arrives in the URL - either as the legacy bare
 * /offer/<raw-token> form or the buyer-wide /offer/<buyer-slug>-<secret> form.
 * Only its SHA-256 hash is ever compared against the stored hash, so the raw
 * value is never persisted or logged. The slug is informational and never part
 * of the lookup; authentication is decided by the fixed-length secret tail
 * alone. This module deliberately returns identity only - routes decide what
 * to expose.
 */

const NO_STORE = { "Cache-Control": "no-store" };

/** One indistinguishable failure for missing, revoked and expired tokens. */
export const INVALID_TOKEN_ERROR = "Akses tidak diizinkan.";

/**
 * Columns the offer flow legitimately needs: the token's validity window and
 * the buyer's display identity. No listing is selected here any more - a valid
 * link identifies the buyer, and the buyer picks a listing from the shared
 * catalog when making an offer.
 */
const offerAccessSelect = {
  id: true,
  userId: true,
  revokedAt: true,
  expiresAt: true,
  user: { select: { companyName: true, name: true } },
} satisfies Prisma.AccessTokenSelect;

export type OfferAccess = Prisma.AccessTokenGetPayload<{
  select: typeof offerAccessSelect;
}>;

export type OfferTokenAuth =
  | { ok: true; access: OfferAccess }
  | { ok: false };

export function hashOfferToken(rawSecret: string): string {
  return createHash("sha256").update(rawSecret).digest("hex");
}

/**
 * Resolves a magic link to the buyer it identifies.
 *
 * Both formats are accepted: /offer/<slug>-<secret> and legacy
 * /offer/<raw-token>. The slug is split off deterministically and ignored for
 * authentication; only the fixed-length secret tail is hashed and compared, so
 * a wrong slug with the right secret still authenticates (by design) and a
 * wrong secret authenticates nothing.
 *
 * Throws if the database is unreachable so each route can answer with its own
 * 500 rather than silently treating a failure as an invalid token.
 */
export async function authenticateOfferToken(
  rawPath: string,
): Promise<OfferTokenAuth> {
  const { secret } = splitOfferPath(rawPath);
  const access = await prisma.accessToken.findUnique({
    where: { tokenHash: hashOfferToken(secret) },
    select: offerAccessSelect,
  });

  if (!access) return { ok: false };
  if (access.revokedAt !== null) return { ok: false };
  if (access.expiresAt.getTime() <= Date.now()) return { ok: false };

  return { ok: true, access };
}

export function invalidOfferTokenResponse(): Response {
  return Response.json(
    { error: INVALID_TOKEN_ERROR },
    { status: 401, headers: NO_STORE },
  );
}

/**
 * Prisma connection failures embed the connection string, so the reason is
 * never forwarded to the client. Swap for redacted structured logging before
 * production.
 */
export function offerInternalErrorResponse(): Response {
  return Response.json(
    { error: "Terjadi kesalahan pada server." },
    { status: 500, headers: NO_STORE },
  );
}