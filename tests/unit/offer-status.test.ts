import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionOfferStatus,
  OFFER_STATUS_TRANSITIONS,
  parseOfferStatusUpdate,
  type OfferStatusUpdateParse,
} from "../../lib/offer-status";
import type { QuoteRequestStatus } from "../../lib/quote-requests";

/**
 * The offer status lifecycle: PENDING -> IN_NEGOTIATION is the normal path,
 * REJECTED / CANCELLED are other outcomes, and ACCEPTED (Disepakati) is NOT a
 * status transition at all - it is only ever produced by "Finalisasi Kesepakatan",
 * the same atomic commit that creates the confirmed Transaction.
 *
 * These tests pin that table (so the status endpoint can never mint a Disepakati
 * offer on its own) and the status-update payload contract.
 */

const ALL_STATUSES: readonly QuoteRequestStatus[] = [
  "PENDING",
  "IN_NEGOTIATION",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
];

test("PENDING can move into negotiation, rejected, or cancelled", () => {
  assert.deepEqual([...OFFER_STATUS_TRANSITIONS.PENDING].sort(), [
    "CANCELLED",
    "IN_NEGOTIATION",
    "REJECTED",
  ]);
});

test("IN_NEGOTIATION can only be rejected or cancelled", () => {
  assert.deepEqual([...OFFER_STATUS_TRANSITIONS.IN_NEGOTIATION].sort(), [
    "CANCELLED",
    "REJECTED",
  ]);
});

test("ACCEPTED is unreachable through the status endpoint", () => {
  for (const from of ALL_STATUSES) {
    assert.equal(
      canTransitionOfferStatus(from, "ACCEPTED"),
      false,
      `${from} -> ACCEPTED must not be a plain status transition`,
    );
  }
});

test("terminal statuses never change again", () => {
  for (const status of ["ACCEPTED", "REJECTED", "CANCELLED"] as const) {
    assert.deepEqual(OFFER_STATUS_TRANSITIONS[status], []);
    for (const target of ALL_STATUSES) {
      assert.equal(
        canTransitionOfferStatus(status, target),
        false,
        `${status} -> ${target} must not be allowed`,
      );
    }
  }
});

test("a status cannot transition to itself", () => {
  for (const status of ALL_STATUSES) {
    assert.equal(canTransitionOfferStatus(status, status), false, status);
  }
});

test("the negotiation path opens PENDING -> IN_NEGOTIATION", () => {
  assert.equal(canTransitionOfferStatus("PENDING", "IN_NEGOTIATION"), true);
  assert.equal(canTransitionOfferStatus("REJECTED", "IN_NEGOTIATION"), false);
});

test("a fresh offer can be rejected or cancelled directly", () => {
  assert.equal(canTransitionOfferStatus("PENDING", "REJECTED"), true);
  assert.equal(canTransitionOfferStatus("PENDING", "CANCELLED"), true);
});

test("parseOfferStatusUpdate accepts a single status field", () => {
  assert.deepEqual(parseOfferStatusUpdate({ status: "IN_NEGOTIATION" }), {
    ok: true,
    status: "IN_NEGOTIATION",
  });
});

test("parseOfferStatusUpdate ignores every non-status field (field protection)", () => {
  const parsed = parseOfferStatusUpdate({
    status: "CANCELLED",
    offerPrice: 1,
    quantity: 1,
    userId: "spoofed",
    coalListingId: "spoofed",
  });
  assert.deepEqual(parsed, { ok: true, status: "CANCELLED" });
});

test("parseOfferStatusUpdate rejects non-object bodies", () => {
  for (const payload of [null, "text", 42, [], undefined, true]) {
    const parsed = parseOfferStatusUpdate(payload);
    assert.equal(parsed.ok, false, JSON.stringify(payload));
  }
});

test("parseOfferStatusUpdate rejects a missing, empty, or non-string status", () => {
  assert.equal(parseOfferStatusUpdate({}).ok, false);
  assert.equal(parseOfferStatusUpdate({ status: "" }).ok, false);
  assert.equal(parseOfferStatusUpdate({ status: "   " }).ok, false);
  assert.equal(parseOfferStatusUpdate({ status: 42 }).ok, false);
  assert.equal(parseOfferStatusUpdate({ status: null }).ok, false);
});

test("parseOfferStatusUpdate rejects unknown status values", () => {
  for (const status of ["QUOTED", "bogus", "PENDING ", "pending"]) {
    const parsed: OfferStatusUpdateParse = parseOfferStatusUpdate({ status });
    assert.equal(parsed.ok, false, status);
  }
});

test("parse error messages are in Bahasa Indonesia", () => {
  assert.deepEqual(parseOfferStatusUpdate("nope"), {
    ok: false,
    error: "Permintaan tidak valid.",
  });
  assert.deepEqual(parseOfferStatusUpdate({}), {
    ok: false,
    error: "Status wajib diisi.",
  });
  assert.deepEqual(parseOfferStatusUpdate({ status: "NOPE" }), {
    ok: false,
    error: "Status tidak dikenal.",
  });
});
