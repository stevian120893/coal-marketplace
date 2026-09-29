/**
 * Status lifecycle for a final Transaction.
 *
 * The seller records the agreed deal as CONFIRMED, then the marketplace record
 * moves through the lifecycle manually:
 *
 *   CONFIRMED -> PROCESSING -> COMPLETED
 *   CONFIRMED -> CANCELLED
 *   PROCESSING -> CANCELLED
 *
 * COMPLETED and CANCELLED are terminal. PENDING exists on the Prisma enum
 * (creation always writes CONFIRMED, so no real row is ever PENDING) and is
 * deliberately not writable or filterable through this admin surface.
 *
 * The status names the *marketplace* state of the deal: it does not imply
 * payment, shipment, settlement, or inspection, and the UI must never claim
 * those happen here. Purely a status vocabulary module: it parses the update
 * payload and answers "may this status change happen?" without touching the
 * database, so every rule is unit-testable.
 */

import {
  isTransactionStatus,
  type TransactionStatus,
} from "@/lib/quote-requests";

/** Which states each status may move to next. Derived by the UI for buttons. */
export const TRANSACTION_STATUS_TRANSITIONS: Record<
  TransactionStatus,
  readonly TransactionStatus[]
> = {
  // PENDING exists on the enum but no row is ever created in it (creation
  // always writes CONFIRMED), so it has no outgoing transitions and is never
  // a reachable target either.
  PENDING: [],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** True when moving from -> to is one of the allowed transitions above. */
export function canTransitionTransactionStatus(
  from: TransactionStatus,
  to: TransactionStatus,
): boolean {
  return TRANSACTION_STATUS_TRANSITIONS[from].includes(to);
}

export type TransactionStatusUpdateParse =
  | { ok: true; status: TransactionStatus }
  | { ok: false; error: string };

/**
 * Parses the body of the transaction status-update endpoint.
 *
 * The endpoint changes status only. Every other field in the body is ignored:
 * a payload that also carries price, quantity, paymentTerms or the identity
 * columns can never touch those columns through this handler.
 */
export function parseTransactionStatusUpdate(
  payload: unknown,
): TransactionStatusUpdateParse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Permintaan tidak valid." };
  }

  const raw = (payload as Record<string, unknown>).status;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Status wajib diisi." };
  }
  if (!isTransactionStatus(raw)) {
    return { ok: false, error: `Status tidak dikenal: ${raw}` };
  }
  return { ok: true, status: raw };
}