import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionTransactionStatus,
  TRANSACTION_STATUS_TRANSITIONS,
  parseTransactionStatusUpdate,
} from "../../lib/transaction-status";
import {
  isTransactionStatus,
  TRANSACTION_STATUSES,
} from "../../lib/quote-requests";

/**
 * Transaction status lifecycle.
 *
 * The MVP lifecycle is explicit and small:
 *
 *   CONFIRMED -> PROCESSING -> COMPLETED
 *   CONFIRMED -> CANCELLED
 *   PROCESSING -> CANCELLED
 *
 * COMPLETED and CANCELLED are terminal, and PENDING is never writable or
 * filterable through the admin surface (creation always writes CONFIRMED).
 * These tests pin the transition table and the update-payload parser so the
 * API and the UI can't drift from each other.
 */

test("the Transaction status vocabulary is the four writable states", () => {
  assert.deepEqual(TRANSACTION_STATUSES, [
    "CONFIRMED",
    "PROCESSING",
    "COMPLETED",
    "CANCELLED",
  ]);
  for (const status of TRANSACTION_STATUSES) {
    assert.equal(isTransactionStatus(status), true, status);
  }
  // PENDING exists on the Prisma enum but is not part of the admin surface.
  assert.equal(isTransactionStatus("PENDING"), false);
  assert.equal(isTransactionStatus("bogus"), false);
  assert.equal(isTransactionStatus(""), false);
});

test("the allowed transitions are CONFIRMED -> PROCESSING/COMPLETED-forward", () => {
  assert.deepEqual(TRANSACTION_STATUS_TRANSITIONS, {
    PENDING: [],
    CONFIRMED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  });

  // Forward lifecycle.
  assert.equal(canTransitionTransactionStatus("CONFIRMED", "PROCESSING"), true);
  assert.equal(canTransitionTransactionStatus("PROCESSING", "COMPLETED"), true);
  // Cancellation from the two active states.
  assert.equal(canTransitionTransactionStatus("CONFIRMED", "CANCELLED"), true);
  assert.equal(canTransitionTransactionStatus("PROCESSING", "CANCELLED"), true);
});

test("terminal states cannot be reopened", () => {
  const forbidden = [
    ["COMPLETED", "PROCESSING"],
    ["COMPLETED", "CANCELLED"],
    ["CANCELLED", "PROCESSING"],
    ["CANCELLED", "CONFIRMED"],
  ] as const;
  for (const [from, to] of forbidden) {
    assert.equal(
      canTransitionTransactionStatus(from, to),
      false,
      `${from} -> ${to} must be rejected`,
    );
  }
});

test("no state can move backwards or into PENDING", () => {
  assert.equal(canTransitionTransactionStatus("PROCESSING", "CONFIRMED"), false);
  assert.equal(canTransitionTransactionStatus("COMPLETED", "COMPLETED"), false);
  assert.equal(canTransitionTransactionStatus("CONFIRMED", "CONFIRMED"), false);
  assert.equal(canTransitionTransactionStatus("CONFIRMED", "PENDING"), false);
  assert.equal(canTransitionTransactionStatus("PROCESSING", "PENDING"), false);
});

test("parseTransactionStatusUpdate accepts a valid status", () => {
  const parsed = parseTransactionStatusUpdate({ status: "PROCESSING" });
  assert.deepEqual(parsed, { ok: true, status: "PROCESSING" });
});

test("parseTransactionStatusUpdate rejects malformed payloads", () => {
  const cases: [string, unknown][] = [
    ["non-object", "just a string"],
    ["null", null],
    ["array", ["PROCESSING"]],
    ["missing status", {}],
    ["empty status", { status: "" }],
    ["whitespace status", { status: "   " }],
    ["non-string status", { status: 42 }],
    ["unknown status", { status: "BOGUS" }],
    ["PENDING is not a writable status", { status: "PENDING" }],
  ];
  for (const [label, payload] of cases) {
    const parsed = parseTransactionStatusUpdate(payload);
    assert.equal(parsed.ok, false, label);
  }
});

test("parseTransactionStatusUpdate ignores every other field", () => {
  const parsed = parseTransactionStatusUpdate({
    status: "CANCELLED",
    price: 1,
    quantity: 1,
    paymentTerms: "spoofed",
    userId: "spoofed",
    coalListingId: "spoofed",
    quoteRequestId: "spoofed",
  });
  assert.deepEqual(parsed, { ok: true, status: "CANCELLED" });
});