/**
 * WhatsApp deep links for the seller -> buyer direction.
 *
 * The marketplace never sends a WhatsApp message. There is no provider, no
 * Business API, no webhook, no backend sender: WhatsApp communication is done
 * by the humans themselves in their own WhatsApp application. This module only
 * builds the `https://wa.me/...` deep link with a prefilled message, which opens
 * the buyer's chat with the deal details already typed out for the seller to
 * press send.
 *
 * Pure module: the message is generated from the trusted Transaction + Buyer +
 * Listing records serialised as plain strings, so every rule is unit-testable
 * and no secret ever reaches the link (no AccessToken, no session, no
 * credentials).
 */

export type FinalDealMessageData = {
  /** Buyer contact name; falls back to "Pembeli" when missing. */
  buyerName: string | null;
  listingTitle: string;
  /** Raw decimal strings straight from the database, formatted here. */
  quantity: string;
  price: string;
  paymentTerms: string | null;
  transactionId: string;
};

const PRICE_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const QUANTITY_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

/** The number - possibly "2000.000" from a DECIMAL column - as "2,000.5". */
function formatQuantity(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? QUANTITY_FORMAT.format(parsed) : value;
}

/** A DECIMAL price - "680000" or "680000.50" - as "680,000.5". */
function formatPrice(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? PRICE_FORMAT.format(parsed) : value;
}

/**
 * The prefilled deal message. Natural business copy in Bahasa Indonesia that
 * identifies the listing, records the final quantity, the final agreed price,
 * the payment terms when agreed, and a transaction reference. No secrets.
 */
export function buildFinalDealMessage(data: FinalDealMessageData): string {
  const lines = [
    `Halo ${data.buyerName?.trim() || "Pembeli"},`,
    "",
    "Berikut ringkasan kesepakatan batubara kita:",
    "",
    "Batubara:",
    data.listingTitle.trim(),
    "",
    "Kuantitas Kesepakatan:",
    `${formatQuantity(data.quantity)} MT`,
    "",
    "Harga Kesepakatan:",
    `Rp ${formatPrice(data.price)} / MT`,
  ];

  if (data.paymentTerms !== null && data.paymentTerms.trim() !== "") {
    lines.push("", "Syarat Pembayaran:", data.paymentTerms.trim());
  }

  lines.push("", "Referensi Transaksi:", data.transactionId);

  return lines.join("\n");
}

/**
 * The buyer's phone as an international dial string for wa.me: digits only,
 * with anything non-numeric stripped ("+62 813 0000 0000" -> "6281300000000").
 * Null when no usable number exists, so callers can hide the link instead of
 * building a broken one.
 */
export function normalizeWhatsAppPhone(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * The seller -> buyer deep link, or null when the buyer has no usable phone.
 *
 * No API call is made anywhere: this is a plain URL the browser/device opens.
 */
export function buildSendDealWhatsAppUrl(
  phone: string | null,
  data: FinalDealMessageData,
): string | null {
  const recipient = normalizeWhatsAppPhone(phone);
  if (recipient === null) return null;
  const message = buildFinalDealMessage(data);
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}