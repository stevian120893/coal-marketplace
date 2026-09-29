import {
  ListingStatus,
} from "@/generated/prisma/enums";
import type { SpecificationRow } from "@/lib/coal-specifications";

/**
 * Wire shapes for the shared buyer listing catalog.
 *
 * Coal Listings are shared commercial listings: many buyers see the same lot.
 * These shapes therefore carry *only* listing-level data - title, category,
 * coal type, origin, quantity, pricing mode, specs, media - and can never
 * contain a Buyer Offer price, a Transaction price, or any buyer identity.
 * The catalog is public by design; commercial records are private and live on
 * the admin surface (lib/quote-requests.ts) or the token-gated buyer deals
 * endpoint (lib/buyer-deals.ts).
 *
 * Pure module: no database or request plumbing, so every rule is unit-testable.
 */

/** The statuses a buyer may see. DRAFT must never be listed; SOLD stays
 *  visible so past lots are still legible, with the Sold state made clear. */
export const VISIBLE_LISTING_STATUSES: readonly ListingStatus[] = [
  "PUBLISHED",
  "SOLD",
];

export function isVisibleListingStatus(value: ListingStatus): boolean {
  return VISIBLE_LISTING_STATUSES.includes(value);
}

/** One card in the shared catalog. */
export type PublicListingSummary = {
  id: string;
  title: string;
  category: string | null;
  coalType: string | null;
  typeLabel: string | null;
  origin: string | null;
  pricingMode: string | null;
  /** Decimal serialised as a string so no precision is lost in JSON. */
  quantity: string | null;
  status: ListingStatus;
};

/** Mirrors the JSON body of GET /api/listings. */
export type PublicListingListResponse = {
  listings: PublicListingSummary[];
  total: number;
  hasMore: boolean;
};

/** One listing as the shared detail page and /listings/[id] render it. */
export type PublicListingDetail = PublicListingSummary & {
  description: string | null;
  specifications: SpecificationRow[];
  /** Asset locations only; ids and upload metadata are never exposed. */
  photos: string[];
  coas: string[];
  videos: string[];
};

/** Mirrors the JSON body of GET /api/listings/[id]. */
export type PublicListingDetailResponse = {
  listing: PublicListingDetail;
};