/**
 * WhatsApp deep links for the human conversations around a deal.
 *
 * The marketplace never sends a WhatsApp message. There is no provider, no
 * Business API, no webhook, no backend sender: WhatsApp communication is done
 * by the humans themselves in their own WhatsApp application. This module only
 * builds `https://wa.me/...` deep links with a prefilled message, which opens
 * the right chat with the details already typed out for the sender to press
 * send.
 *
 * Two directions, one pure module:
 *
 *   - buyer -> seller: once the buyer's offer is stored, the buyer follows up
 *     with the seller (buildBuyerOfferMessage / buildOfferWhatsAppUrl).
 *   - seller -> buyer: when a deal is finalized, the seller opens the buyer's
 *     chat with the deal details (buildFinalDealMessage /
 *     buildSendDealWhatsAppUrl).
 *
 * Pure module: both messages are generated from plain serialisable data (never
 * from the database directly), so every rule is unit-testable and no secret
 * ever reaches the link (no AccessToken, no session, no credentials).
 */

/**
 * The seller's WhatsApp number, as the digits-only international dial string
 * wa.me expects. TEMPORARY: a single seller serves every buyer for now; when
 * multi-seller support lands, this moves onto the Listing/Seller record and
 * the buyer offer follow-up starts reading it from there.
 */
export const SELLER_WHATSAPP_NUMBER = "62818232332";

export type BuyerOfferMessageData = {
  /** Buyer company name (contact name as a fallback); line omitted when absent. */
  companyName: string | null;
  listingTitle: string;
  quantity: number;
  offerPrice: number;
  paymentTerms: string | null;
  notes: string | null;
};

const PRICE_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const QUANTITY_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

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
 * The prefilled follow-up message the buyer sends to the seller after their
 * offer was stored. Natural business copy in Bahasa Indonesia that restates
 * the submitted offer: the listing, the quantity, the buyer's offer price,
 * and - when provided - the payment terms, notes and buyer company name. This
 * is the buyer's own message composed in their own WhatsApp app; the system
 * never sends anything itself.
 */
export function buildBuyerOfferMessage(data: BuyerOfferMessageData): string {
  const lines = [
    "Halo, saya ingin menindaklanjuti penawaran pembelian batubara berikut:",
    "",
  ];

  if (data.companyName !== null && data.companyName.trim() !== "") {
    lines.push("Perusahaan:", data.companyName.trim(), "");
  }

  lines.push(
    "Batubara:",
    data.listingTitle.trim(),
    "",
    "Kuantitas:",
    `${formatQuantity(String(data.quantity))} MT`,
    "",
    "Harga Penawaran:",
    `Rp ${formatPrice(String(data.offerPrice))} / MT`,
  );

  if (data.paymentTerms !== null && data.paymentTerms.trim() !== "") {
    lines.push("", "Syarat Pembayaran:", data.paymentTerms.trim());
  }
  if (data.notes !== null && data.notes.trim() !== "") {
    lines.push("", "Catatan:", data.notes.trim());
  }

  return lines.join("\n");
}

/**
 * The buyer -> seller deep link to the fixed seller number, prefilled with the
 * offer summary the buyer just submitted. A plain wa.me URL; no API call is
 * made anywhere, the browser/device opens it directly.
 */
export function buildOfferWhatsAppUrl(data: BuyerOfferMessageData): string {
  const message = buildBuyerOfferMessage(data);
  return `https://wa.me/${SELLER_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
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