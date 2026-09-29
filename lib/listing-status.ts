/**
 * Status lifecycle for a shared Coal Listing.
 *
 * Small, explicit transition set, mirroring the offer/transaction lifecycles:
 *
 *   DRAFT     -> PUBLISHED, SOLD
 *   PUBLISHED -> DRAFT (unpublish), SOLD
 *   SOLD        (terminal - a sold lot is never re-listed)
 *
 * Create always writes DRAFT; the admin publishes to make a lot visible in the
 * shared buyer catalog, and marks it SOLD once the deal is done. No states are
 * invented beyond the three on the Prisma enum.
 *
 * Purely a status vocabulary module: it answers "may this status change
 * happen?" without touching the database, so every rule is unit-testable.
 */

import {
  isListingStatus,
  type ListingStatus,
} from "@/lib/quote-requests";

/** Which states each status may move to next. Derived by the UI for buttons. */
export const LISTING_STATUS_TRANSITIONS: Record<
  ListingStatus,
  readonly ListingStatus[]
> = {
  DRAFT: ["PUBLISHED", "SOLD"],
  PUBLISHED: ["DRAFT", "SOLD"],
  SOLD: [],
};

/** True when moving from -> to is one of the allowed transitions above. */
export function canTransitionListingStatus(
  from: ListingStatus,
  to: ListingStatus,
): boolean {
  return LISTING_STATUS_TRANSITIONS[from].includes(to);
}

export type ListingStatusUpdateParse =
  | { ok: true; status: ListingStatus }
  | { ok: false; error: string };

/**
 * Parses a standalone status update payload (the status control posts
 * `{ status }`; the listing PATCH validates status through the same gate).
 * An unknown value is 400 material, never silently ignored.
 */
export function parseListingStatusUpdate(value: unknown): ListingStatusUpdateParse {
  if (
    typeof value !== "object" ||
    value === null ||
    (!("status" in value) && !("status" in (value as Record<string, unknown>)))
  ) {
    return { ok: false, error: "Status wajib diisi." };
  }

  const raw = (value as Record<string, unknown>).status;
  if (typeof raw !== "string") {
    return { ok: false, error: "Status harus berupa teks." };
  }
  if (!isListingStatus(raw)) {
    return { ok: false, error: "Status listing tidak dikenal." };
  }
  return { ok: true, status: raw };
}