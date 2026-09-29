import type { QuoteRequestStatus, TransactionStatus } from "@/lib/quote-requests";

/**
 * Display formatting for the admin screens.
 *
 * House style, shared with the buyer offer page: percentages are tight
 * ("22%"), word units are spaced ("5,041 kcal/kg"), and a missing value renders
 * as an em dash so a gap never reads as a zero. Numbers keep the familiar
 * thousands separator rather than a locale-specific one, so a price reads the
 * same way everywhere it is shown.
 */

const EM_DASH = "—";

/**
 * Timestamps are rendered in UTC and labelled as such. Pinning the timezone
 * keeps the admin screens deterministic across server environments; switching to
 * a local timezone is a product decision, not a formatting detail.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/**
 * Offer status labels, shown to sellers in Bahasa Indonesia.
 *
 * The buyer's proposal is always "Harga Penawaran"; the final agreed deal is
 * always "Harga Kesepakatan" / "Harga Transaksi". The two must never be blurred,
 * so the labels are an explicit map rather than a derived capitalisation: a new
 * enum value has to be named on purpose before it can reach a screen.
 */
const OFFER_STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  PENDING: "Menunggu",
  IN_NEGOTIATION: "Dalam Negosiasi",
  ACCEPTED: "Disepakati",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export function statusLabel(status: QuoteRequestStatus): string {
  return OFFER_STATUS_LABELS[status];
}

/** Transaction status labels, shown to sellers in Bahasa Indonesia. */
const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  PENDING: "Menunggu",
  CONFIRMED: "Dikonfirmasi",
  PROCESSING: "Diproses",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export function transactionStatusLabel(status: TransactionStatus): string {
  return TRANSACTION_STATUS_LABELS[status];
}

export function formatMetric(
  value: string | null,
  unit: string,
  options: { spaced?: boolean; maximumFractionDigits?: number } = {},
): string {
  const { spaced = true, maximumFractionDigits = 2 } = options;
  if (value === null) return EM_DASH;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EM_DASH;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(parsed);
  return `${formatted}${spaced ? " " : ""}${unit}`;
}

/** Whole-fraction values only: prices and tonnages are not shown in cents. */
export function formatNumber(value: string | null): string {
  if (value === null) return EM_DASH;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EM_DASH;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(
    parsed,
  );
}

/**
 * Rupiah per MT, whole rupiah only. Prices are negotiated and shown without
 * decimals ("Rp 650,000"), matching how the offer form takes them.
 */
export function formatPrice(value: string | null): string {
  if (value === null) return EM_DASH;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EM_DASH;
  return `Rp ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(parsed)}`;
}

/** Day precision, for list rows. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return DATE_FORMAT.format(date);
}

/** Minute precision with an explicit zone, for the detail view. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return `${DATE_FORMAT.format(date)}, ${TIME_FORMAT.format(date)} UTC`;
}

/** Optional free text: an empty or absent string renders as an em dash. */
export function formatText(value: string | null): string {
  if (value === null) return EM_DASH;
  const trimmed = value.trim();
  return trimmed.length === 0 ? EM_DASH : trimmed;
}
