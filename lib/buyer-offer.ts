/**
 * Validation for a buyer's initial offer (POST /api/offer/[token]/quote).
 *
 * Pure module, deliberately free of database and request plumbing, so every
 * rule is unit-testable. The route layer supplies the JSON payload and the
 * authenticated AccessToken; this module decides what a well-formed offer looks
 * like and rejects attempts to spoof server-controlled fields.
 *
 * The payload carries the buyer's chosen `listingId` (the buyer-wide link
 * identifies the buyer; the buyer picks the listing) plus the offer terms. The
 * server validates the listing against the database and derives userId from
 * the token.
 *
 * Offer price is the buyer's initial proposal and is stored in the Decimal
 * column `offerPrice`. It is a different concept from Transaction.price (the
 * final agreed price) and the two must not be conflated.
 *
 * Money is never handled as floating point in storage: the API accepts numbers
 * here, but only values that map exactly onto DECIMAL(14,2) are accepted, and
 * the route always persists the value through Prisma's Decimal type.
 */

export const MAX_PAYMENT_TERMS_LENGTH = 500;
export const MAX_NOTES_LENGTH = 2000;

/** Ceiling of the DECIMAL(14,2) money column: 999,999,999,999.99. */
export const MAX_OFFER_PRICE = 999_999_999_999.99;
/** Ceiling of the DECIMAL(12,3) quantity column: 999,999,999.999. */
export const MAX_QUANTITY = 999_999_999.999;

/** Relative tolerance for the "fits the column's scale" checks. */
const SCALE_EPSILON = 1e-9;

/**
 * Fields the client must never set. Identity comes from the AccessToken the
 * magic link resolves to; status is owned by the workflow; the transaction is
 * created later by the admin. An attempt to send any of them is rejected rather
 * than silently ignored.
 *
 * The selected LISTING, by contrast, is intentionally client-supplied: the
 * buyer-wide link identifies the buyer, and the buyer chooses which listing to
 * make an offer on via `listingId`.
 */
const SERVER_CONTROLLED_FIELDS = [
  "userId",
  "status",
  "transactionId",
] as const;

/** Length ceiling for listing ids (cuid ids are short; headroom for future). */
export const MAX_LISTING_ID_LENGTH = 100;

export type BuyerOfferInput = {
  listingId: string;
  quantity: number;
  offerPrice: number;
  paymentTerms: string | null;
  notes: string | null;
};

export type BuyerOfferParse =
  | { ok: true; value: BuyerOfferInput }
  | { ok: false; error: string };

/**
 * A number must be exactly representable at the column's scale: an offerPrice
 * of 650000 or 650000.25 is fine, 650000.005 is rejected instead of being
 * silently rounded by the database.
 */
function fitsScale(value: number, places: number): boolean {
  const factor = 10 ** places;
  return Math.abs(value - Math.round(value * factor) / factor) <= SCALE_EPSILON;
}

/** Optional free text: absent, null, and "" all mean "not provided". */
function readOptionalText(
  value: unknown,
  label: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `${label} harus berupa teks.` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${label} terlalu panjang.` };
  }
  return { ok: true, value: trimmed };
}

function readRequiredNumber(
  body: Record<string, unknown>,
  field: string,
  options: { label: string; min: number; max: number; scale: number },
): { ok: true; value: number } | { ok: false; error: string } {
  const { label, min, max, scale } = options;
  const value = body[field];
  if (value === undefined || value === null) {
    return { ok: false, error: `${label} wajib diisi.` };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `${label} harus berupa angka.` };
  }
  if (value <= min) {
    return { ok: false, error: `${label} harus lebih dari 0.` };
  }
  if (value > max) {
    return { ok: false, error: `${label} terlalu besar.` };
  }
  if (!fitsScale(value, scale)) {
    return {
      ok: false,
      error: `${label} mendukung maksimal ${scale} angka desimal.`,
    };
  }
  return { ok: true, value };
}

function readListingId(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: "Permintaan tidak valid." };
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_LISTING_ID_LENGTH) {
    return { ok: false, error: "Permintaan tidak valid." };
  }
  return { ok: true, value: trimmed };
}

/**
 * Parses and validates a buyer offer payload.
 *
 * Returns ok:false with a human-readable message for every rejected shape. The
 * caller decides the HTTP response; this module never touches I/O.
 */
export function parseBuyerOffer(payload: unknown): BuyerOfferParse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Permintaan tidak valid." };
  }

  const body = payload as Record<string, unknown>;

  for (const field of SERVER_CONTROLLED_FIELDS) {
    if (body[field] !== undefined) {
      return {
        ok: false,
        error: "Permintaan tidak valid.",
      };
    }
  }

  // The listing is the buyer's own pick from the shared catalog - it is now an
  // intentional part of the request, and the server validates it against the
  // database rather than trusting it blindly. It is not a server-controlled
  // field, and it is not derived from the token.
  const listingId = readListingId(body.listingId);
  if (!listingId.ok) return { ok: false, error: listingId.error };

  const quantity = readRequiredNumber(body, "quantity", {
    label: "Kuantitas",
    min: 0,
    max: MAX_QUANTITY,
    scale: 3,
  });
  if (!quantity.ok) return { ok: false, error: quantity.error };

  const offerPrice = readRequiredNumber(body, "offerPrice", {
    label: "Harga penawaran",
    min: 0,
    max: MAX_OFFER_PRICE,
    scale: 2,
  });
  if (!offerPrice.ok) return { ok: false, error: offerPrice.error };

  const paymentTerms = readOptionalText(
    body.paymentTerms,
    "Syarat pembayaran",
    MAX_PAYMENT_TERMS_LENGTH,
  );
  if (!paymentTerms.ok) return { ok: false, error: paymentTerms.error };

  const notes = readOptionalText(body.notes, "Catatan", MAX_NOTES_LENGTH);
  if (!notes.ok) return { ok: false, error: notes.error };

  return {
    ok: true,
    value: {
      listingId: listingId.value,
      quantity: quantity.value,
      offerPrice: offerPrice.value,
      paymentTerms: paymentTerms.value,
      notes: notes.value,
    },
  };
}