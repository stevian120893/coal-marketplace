import {
  CoalCategory,
  CoalType,
  ListingStatus,
  PricingMode,
  QuoteRequestStatus,
  TransactionStatus,
  UserStatus,
} from "@/generated/prisma/enums";
import type { SpecificationRow } from "@/lib/coal-specifications";

/**
 * Domain vocabulary shared by the admin API handlers and the admin pages
 * (buyer offers, final Transactions, coal listings, buyers).
 *
 * The status / enum lists are derived from the Prisma enums, so adding a value
 * to prisma/schema.prisma surfaces it in the admin UI and the API contract
 * without editing this file.
 *
 * Nothing in this module touches the database, and no shape here includes
 * AccessToken data: tokenHash and token state stay out of the admin surface by
 * construction, not by review.
 */

/** Re-exported so consumers need only this module for the vocabulary. */
export type {
  CoalCategory,
  CoalType,
  ListingStatus,
  PricingMode,
  QuoteRequestStatus,
  TransactionStatus,
  UserStatus,
};

/** Every status the admin UI can filter by, straight from the schema. */
export const QUOTE_REQUEST_STATUSES: readonly QuoteRequestStatus[] =
  Object.values(QuoteRequestStatus);

const KNOWN_STATUSES: ReadonlySet<string> = new Set(QUOTE_REQUEST_STATUSES);

/**
 * The Transaction statuses the admin surface can use. PENDING exists on the
 * Prisma enum but is deliberately excluded: creation always writes CONFIRMED,
 * so no real row is ever PENDING, and neither the filters nor the status
 * update endpoint should accept it.
 */
export const TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
];

const KNOWN_TRANSACTION_STATUSES: ReadonlySet<string> = new Set(
  TRANSACTION_STATUSES,
);

/**
 * Guards a value that arrived from a query string. A caller can send anything,
 * so an unrecognised filter is rejected rather than silently treated as "All".
 */
export function isQuoteRequestStatus(
  value: string,
): value is QuoteRequestStatus {
  return KNOWN_STATUSES.has(value);
}

/**
 * Guards a filter/update value for the Transaction surface. PENDING is never
 * accepted, matching the writable/filterable set this module exports.
 */
export function isTransactionStatus(
  value: string,
): value is TransactionStatus {
  return KNOWN_TRANSACTION_STATUSES.has(value);
}

/** Every CoalListing category, straight from the schema. */
export const COAL_CATEGORIES: readonly CoalCategory[] =
  Object.values(CoalCategory);

/** Every CoalListing coal type, straight from the schema. */
export const COAL_TYPES: readonly CoalType[] = Object.values(CoalType);

/** Every PricingMode, straight from the schema. NEGOTIABLE is the only mode
 *  implemented; FIXED is reserved for a future phase. */
export const PRICING_MODES: readonly PricingMode[] = Object.values(PricingMode);

/** Every ListingStatus, straight from the schema. */
export const LISTING_STATUSES: readonly ListingStatus[] =
  Object.values(ListingStatus);

const KNOWN_LISTING_STATUSES: ReadonlySet<string> = new Set(LISTING_STATUSES);
const KNOWN_CATEGORIES: ReadonlySet<string> = new Set(COAL_CATEGORIES);
const KNOWN_COAL_TYPES: ReadonlySet<string> = new Set(COAL_TYPES);
const KNOWN_PRICING_MODES: ReadonlySet<string> = new Set(PRICING_MODES);

/** Guards a value that arrived from a query string or request body. */
export function isListingStatus(value: string): value is ListingStatus {
  return KNOWN_LISTING_STATUSES.has(value);
}

export function isCoalCategory(value: string): value is CoalCategory {
  return KNOWN_CATEGORIES.has(value);
}

export function isCoalType(value: string): value is CoalType {
  return KNOWN_COAL_TYPES.has(value);
}

export function isPricingMode(value: string): value is PricingMode {
  return KNOWN_PRICING_MODES.has(value);
}

/** Every UserStatus, straight from the schema. */
export const USER_STATUSES: readonly UserStatus[] = Object.values(UserStatus);

const KNOWN_USER_STATUSES: ReadonlySet<string> = new Set(USER_STATUSES);

/** Guards a buyer status value that arrived from a request body. */
export function isUserStatus(value: string): value is UserStatus {
  return KNOWN_USER_STATUSES.has(value);
}

/**
 * Buyer contact details. The list endpoint returns only the summary pair;
 * phone and email are reserved for the detail view to keep contact details out
 * of the list response.
 */
export type AdminBuyerSummary = {
  companyName: string | null;
  name: string | null;
};

export type AdminBuyerDetail = AdminBuyerSummary & {
  phone: string | null;
  email: string | null;
};

export type AdminListingSummary = {
  id: string;
  title: string;
};

/**
 * The coal lot as it appears inside a Buyer Offer (quote request) or its
 * Transaction detail: the shared-listing facts the offer surfaced. This is the
 * offer-context view, distinct from the admin listing record
 * (AdminListingDetail below), which adds status and the managed media URLs.
 */
export type AdminOfferListingDetail = AdminListingSummary & {
  description: string | null;
  category: string | null;
  coalType: string | null;
  typeLabel: string | null;
  origin: string | null;
  pricingMode: string | null;
  quantity: string | null;
  /** Flexible specifications (legacy fixed columns merged in). */
  specifications: SpecificationRow[];
};

/**
 * Decimal columns are serialised as strings so no precision is lost in JSON,
 * matching GET /api/offer/[token].
 */
export type QuoteRequestListItem = {
  id: string;
  status: QuoteRequestStatus;
  quantity: string;
  /** The buyer's initial offer price per MT; null only for pre-model rows. */
  offerPrice: string | null;
  paymentTerms: string | null;
  createdAt: string;
  buyer: AdminBuyerSummary;
  coalListing: AdminListingSummary;
};

/** Mirrors the JSON body of GET /api/admin/quote-requests. */
export type QuoteRequestListResponse = {
  quoteRequests: QuoteRequestListItem[];
  filter: { status: QuoteRequestStatus | null };
  /** Total rows matching the filter, not the length of `quoteRequests`. */
  total: number;
  hasMore: boolean;
};

/** Mirrors the JSON body of GET /api/admin/quote-requests/[id]. */
export type QuoteRequestDetailResponse = {
  quoteRequest: {
    id: string;
    status: QuoteRequestStatus;
    quantity: string;
    /** The buyer's initial offer price per MT; null only for pre-model rows. */
    offerPrice: string | null;
    paymentTerms: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    buyer: AdminBuyerDetail;
    coalListing: AdminOfferListingDetail;
    /**
     * The final agreed deal, when one exists. Always null until the admin
     * records it from an ACCEPTED offer; its price is a separate concept from
     * offerPrice.
     */
    transaction: AdminTransactionDetail | null;
  };
};

/**
 * The final agreed deal as the admin detail view renders it: the commercial
 * terms settled after manual negotiation, distinct from the buyer's original
 * offer.
 */
export type AdminTransactionDetail = {
  id: string;
  /** The final agreed price per MT - never the buyer's offerPrice. */
  price: string;
  quantity: string;
  paymentTerms: string | null;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Mirrors the JSON body of POST /api/admin/quote-requests/[id]/transaction.
 *
 * The response carries the created deal with the identity the server derived
 * from the accepted offer; quoteRequestId / userId / coalListingId / status are
 * never client-supplied.
 */
export type TransactionCreateResponse = {
  transaction: {
    id: string;
    quoteRequestId: string;
    quantity: string;
    price: string;
    paymentTerms: string | null;
    status: TransactionStatus;
    createdAt: string;
  };
};

/**
 * Mirrors the JSON body of PATCH /api/admin/quote-requests/[id].
 *
 * The update is status-only: offerPrice, quantity, paymentTerms, notes and the
 * buyer/listing identity are never writable through this endpoint, so the
 * response carries just the identity of the row and the new status.
 */
export type QuoteRequestStatusUpdateResponse = {
  quoteRequest: {
    id: string;
    status: QuoteRequestStatus;
    updatedAt: string;
  };
};

/**
 * One row of the admin Transaction list. Contact details are left out on
 * purpose so the list surface stays small; phone and email belong to the
 * detail view only.
 */
export type AdminTransactionListItem = {
  id: string;
  status: TransactionStatus;
  quantity: string;
  /** The final agreed price per MT - never the buyer's offerPrice. */
  price: string;
  paymentTerms: string | null;
  createdAt: string;
  buyer: AdminBuyerSummary;
  coalListing: AdminListingSummary;
};

/** Mirrors the JSON body of GET /api/admin/transactions. */
export type TransactionListResponse = {
  transactions: AdminTransactionListItem[];
  filter: { status: TransactionStatus | null };
  /** Total rows matching the filter, not the length of `transactions`. */
  total: number;
  hasMore: boolean;
};

/**
 * The historical Buyer Offer a Transaction originated from, as the Transaction
 * detail renders it. Deliberately a separate shape from AdminTransactionDetail:
 * offerPrice is the buyer's original proposal and must never be shown as the
 * Transaction Price.
 */
export type AdminSourceOfferSummary = {
  id: string;
  status: QuoteRequestStatus;
  quantity: string;
  /** The buyer's original offer price per MT; null only for pre-model rows. */
  offerPrice: string | null;
  paymentTerms: string | null;
  createdAt: string;
};

/** Mirrors the JSON body of GET /api/admin/transactions/[id]. */
export type AdminTransactionDetailResponse = {
  transaction: AdminTransactionDetail;
  buyer: AdminBuyerDetail;
  coalListing: AdminOfferListingDetail;
  sourceOffer: AdminSourceOfferSummary;
};

/**
 * Mirrors the JSON body of PATCH /api/admin/transactions/[id].
 *
 * Mirrors the Buyer Offer status update: only the status column may change,
 * so the response carries the row identity, the new status, and when that
 * change was recorded - never the commercial terms.
 */
export type TransactionStatusUpdateResponse = {
  transaction: {
    id: string;
    status: TransactionStatus;
    updatedAt: string;
  };
};

/**
 * One row of the admin Buyer list. Buyers are User rows with role = BUYER;
 * the admin surface never exposes role through the list because every row
 * here is a buyer by construction.
 */
export type AdminBuyerListItem = {
  id: string;
  companyName: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  createdAt: string;
};

/** Mirrors the JSON body of GET /api/admin/buyers. */
export type AdminBuyerListResponse = {
  buyers: AdminBuyerListItem[];
  total: number;
  hasMore: boolean;
};

/** The Buyer detail profile: identity, status, and private record counts. */
export type AdminBuyerProfile = AdminBuyerListItem & {
  updatedAt: string;
  accessLinkCount: number;
  offerCount: number;
  transactionCount: number;
};

/** Mirrors the JSON body of GET /api/admin/buyers/[id]. */
export type AdminBuyerDetailResponse = {
  buyer: AdminBuyerProfile;
};

/** Mirrors the JSON body of POST /api/admin/buyers. */
export type BuyerCreateResponse = {
  buyer: {
    id: string;
    companyName: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    status: UserStatus;
  };
};

/** Mirrors the JSON body of PATCH /api/admin/buyers/[id]. */
export type BuyerUpdateResponse = {
  buyer: {
    id: string;
    companyName: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    status: UserStatus;
    updatedAt: string;
  };
};

/**
 * One row of the admin Coal Listing list. Specification and media counts are
 * scalar summaries so the list row can say "4 specs, 2 photos" without
 * dragging every child row across the wire.
 */
export type AdminListingListItem = {
  id: string;
  title: string;
  category: CoalCategory | null;
  coalType: CoalType | null;
  typeLabel: string | null;
  origin: string | null;
  pricingMode: PricingMode;
  quantity: string | null;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
  specificationCount: number;
  photoCount: number;
  coaCount: number;
  videoCount: number;
};

/** Mirrors the JSON body of GET /api/admin/listings. */
export type AdminListingListResponse = {
  listings: AdminListingListItem[];
  total: number;
  hasMore: boolean;
};

/**
 * The full admin listing record: basic information, flexible specifications,
 * and the media URL references (photos / COA / videos) managed from the admin
 * edit screen. Commercial data (offers, transactions) never appears here.
 */
export type AdminListingDetail = AdminListingListItem & {
  description: string | null;
  specifications: SpecificationRow[];
  photos: string[];
  coas: string[];
  videos: string[];
};

/** Mirrors the JSON body of GET /api/admin/listings/[id]. */
export type AdminListingDetailResponse = {
  listing: AdminListingDetail;
};

/** Mirrors the JSON body of POST /api/admin/listings (always created DRAFT). */
export type ListingCreateResponse = {
  listing: {
    id: string;
    status: ListingStatus;
  };
};

/** Mirrors the JSON body of PATCH /api/admin/listings/[id]. */
export type ListingUpdateResponse = {
  listing: {
    id: string;
    status: ListingStatus;
    updatedAt: string;
  };
};

/**
 * Mirrors the JSON body of POST /api/admin/access-links.
 *
 * The link identifies one buyer across every shared listing, so no listing is
 * part of the response. The raw secret lives only in the returned link URL;
 * the database stores only its SHA-256 hash, so no response and no row can ever
 * expose the hash or regenerate the link from data alone.
 */
export type AccessLinkCreateResponse = {
  accessLink: {
    id: string;
    url: string;
    expiresAt: string;
    buyer: { id: string; companyName: string | null; name: string | null };
  };
};