/**
 * Buyer offer wire shape.
 *
 * The exact JSON the buyer UI posts to /api/offer/[token]/quote. Extracted as
 * a pure .ts module so it can be unit-tested without importing the React
 * component, and so the UI and its test share one source of truth.
 *
 * The contract: the UI sends the buyer's own choice of listing plus their
 * inputs - { listingId, quantity, offerPrice, paymentTerms, notes } - and
 * never server-controlled fields (userId / status / transactionId), which the
 * server derives from the access token. Blank optional fields are normalised to
 * null, matching the server's parser (lib/buyer-offer.ts).
 */

export type OfferBodyInput = {
  listingId: string;
  quantity: number;
  offerPrice: number;
  paymentTerms: string | null;
  notes: string | null;
};

export function buildOfferBody(input: OfferBodyInput): OfferBodyInput {
  const paymentTerms = input.paymentTerms?.trim();
  const notes = input.notes?.trim();
  return {
    listingId: input.listingId.trim(),
    quantity: input.quantity,
    offerPrice: input.offerPrice,
    paymentTerms: paymentTerms ? paymentTerms : null,
    notes: notes ? notes : null,
  };
}