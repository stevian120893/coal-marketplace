/**
 * Validation for the final Transaction created when the seller finalizes a deal
 * on a Buyer Offer (POST /api/admin/quote-requests/[id]/transaction).
 *
 * Mirror module of lib/buyer-offer.ts with the same number rules, kept separate
 * because the two payloads are deliberately different contracts: the buyer
 * submits an offer (offerPrice), the admin finalizes the negotiated deal
 * (Transaction.price). Both stay independent records, and neither parser shares
 * state. The buyer's offerPrice is never overwritten by the final price.
 *
 * Pure module: no database or request plumbing, so every rule is unit-testable.
 * The route layer supplies the JSON payload and the offer under negotiation;
 * this module decides what a well-formed final deal looks like.
 *
 * Money is never handled as floating point in storage: the API accepts numbers
 * here, but only values that map exactly onto the DECIMAL columns are accepted
 * (price DECIMAL(14,2), quantity DECIMAL(12,3)), and the route always persists
 * through Prisma's Decimal type.
 */

export const MAX_TRANSACTION_PRICE = 999_999_999_999.99;
/** Ceiling of the DECIMAL(12,3) quantity column: 999,999,999.999. */
export const MAX_TRANSACTION_QUANTITY = 999_999_999.999;

export const MAX_FINAL_PAYMENT_TERMS_LENGTH = 500;

/** Relative tolerance for the "fits the column's scale" checks. */
const SCALE_EPSILON = 1e-9;

export type FinalTransactionInput = {
  quantity: number;
  /** The final agreed price per MT - never the buyer's offerPrice. */
  price: number;
  paymentTerms: string | null;
};

export type FinalTransactionParse =
  | { ok: true; value: FinalTransactionInput }
  | { ok: false; error: string };

/**
 * A number must be exactly representable at the column's scale: 680000 or
 * 680000.25 is fine, 680000.005 is rejected instead of being silently rounded.
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

/**
 * Parses and validates the finalization payload for "Finalisasi Kesepakatan".
 *
 * The identity fields (quoteRequestId / userId / coalListingId / status) are
 * server-controlled: they are ignored here - the route derives them from the
 * offer being finalized - and a client that includes them simply has no effect.
 */
export function parseFinalTransactionInput(
  payload: unknown,
): FinalTransactionParse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Permintaan tidak valid." };
  }

  const body = payload as Record<string, unknown>;

  const quantity = readRequiredNumber(body, "quantity", {
    label: "Kuantitas kesepakatan",
    min: 0,
    max: MAX_TRANSACTION_QUANTITY,
    scale: 3,
  });
  if (!quantity.ok) return { ok: false, error: quantity.error };

  const price = readRequiredNumber(body, "price", {
    label: "Harga kesepakatan",
    min: 0,
    max: MAX_TRANSACTION_PRICE,
    scale: 2,
  });
  if (!price.ok) return { ok: false, error: price.error };

  const paymentTerms = readOptionalText(
    body.paymentTerms,
    "Syarat pembayaran",
    MAX_FINAL_PAYMENT_TERMS_LENGTH,
  );
  if (!paymentTerms.ok) return { ok: false, error: paymentTerms.error };

  return {
    ok: true,
    value: {
      quantity: quantity.value,
      price: price.value,
      paymentTerms: paymentTerms.value,
    },
  };
}