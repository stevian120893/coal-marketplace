import { QuoteRequestStatus, TransactionStatus } from "@/generated/prisma/enums";

/**
 * Wire shapes for the token-gated "your offers and deal" endpoint
 * (GET /api/offer/[token]/deals).
 *
 * These are private records: the endpoint resolves the buyer from the
 * AccessToken and returns only rows whose userId matches that buyer on the
 * token's own listing, so one buyer can never read another buyer's Offer Price
 * or Transaction Price through it. The marketplace keeps its promise that a
 * Transaction's price is visible only to the transaction's buyer and the
 * admin/seller.
 *
 * Pure module: no database or request plumbing.
 */

/** One of the buyer's own offers (their initial proposal, status included). */
export type BuyerOfferSummary = {
  id: string;
  status: QuoteRequestStatus;
  quantity: string;
  /** The buyer's initial proposal per MT; null only for pre-model rows. */
  offerPrice: string | null;
  paymentTerms: string | null;
  notes: string | null;
  /** The shared listing the offer was made on, for buyer-wide offer panels. */
  listingTitle: string | null;
  createdAt: string;
};

/** The final agreed deal for the buyer, when one exists. */
export type BuyerTransactionSummary = {
  id: string;
  status: TransactionStatus;
  quantity: string;
  /** The final agreed price per MT - never the buyer's offerPrice. */
  price: string;
  paymentTerms: string | null;
  createdAt: string;
};

/** Mirrors the JSON body of GET /api/offer/[token]/deals. */
export type BuyerDealsResponse = {
  offers: BuyerOfferSummary[];
  transaction: BuyerTransactionSummary | null;
};