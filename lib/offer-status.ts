/**
 * Status lifecycle for a buyer offer (QuoteRequest).
 *
 * Negotiation is manual and lives outside the system, so the offer has a small,
 * explicit transition set instead of a rules engine:
 *
 *   PENDING        -> IN_NEGOTIATION, REJECTED, CANCELLED
 *   IN_NEGOTIATION -> REJECTED, CANCELLED
 *   ACCEPTED         (terminal — reachable ONLY through deal finalization)
 *   REJECTED         (terminal)
 *   CANCELLED        (terminal)
 *
 * ACCEPTED is deliberately unreachable from this table. A buyer offer only ever
 * becomes Disepakati as the other half of "Finalisasi Kesepakatan", where the
 * same atomic database commit also creates the confirmed Transaction. Removing
 * ACCEPTED from here is what makes "an accepted offer without a final
 * transaction" structurally impossible rather than merely discouraged: the status
 * endpoint can no longer mint a Disepakati offer on its own.
 *
 * Terminal states never change again, which keeps the audit trail unambiguous.
 * Purely a status vocabulary module: it parses the update payload and answers
 * "may this status change happen?" without touching the database, so every rule
 * is unit-testable.
 */

import {
  isQuoteRequestStatus,
  type QuoteRequestStatus,
} from "@/lib/quote-requests";

/** Which states each status may move to next. Derived by the UI for buttons. */
export const OFFER_STATUS_TRANSITIONS: Record<
  QuoteRequestStatus,
  readonly QuoteRequestStatus[]
> = {
  PENDING: ["IN_NEGOTIATION", "REJECTED", "CANCELLED"],
  IN_NEGOTIATION: ["REJECTED", "CANCELLED"],
  ACCEPTED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** True when moving from -> to is one of the allowed transitions above. */
export function canTransitionOfferStatus(
  from: QuoteRequestStatus,
  to: QuoteRequestStatus,
): boolean {
  return OFFER_STATUS_TRANSITIONS[from].includes(to);
}

export type OfferStatusUpdateParse =
  | { ok: true; status: QuoteRequestStatus }
  | { ok: false; error: string };

/**
 * Parses the body of the status-update endpoint.
 *
 * The endpoint changes status only. Every other field in the body is ignored:
 * a payload that also carries offerPrice, quantity, userId or coalListingId is
 * processed for its status alone and can never touch those columns through
 * this handler (server-authoritative; the caller decides the HTTP status).
 */
export function parseOfferStatusUpdate(
  payload: unknown,
): OfferStatusUpdateParse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Permintaan tidak valid." };
  }

  const raw = (payload as Record<string, unknown>).status;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Status wajib diisi." };
  }
  if (!isQuoteRequestStatus(raw)) {
    return { ok: false, error: "Status tidak dikenal." };
  }
  return { ok: true, status: raw };
}