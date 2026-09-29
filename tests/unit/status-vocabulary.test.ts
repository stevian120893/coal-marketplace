import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isQuoteRequestStatus,
  QUOTE_REQUEST_STATUSES,
} from "../../lib/quote-requests";

/**
 * The status vocabulary is a domain decision: PENDING / IN_NEGOTIATION /
 * ACCEPTED / REJECTED / CANCELLED, and no QUOTED (no digital quote or
 * counter-offer workflow exists). The admin filter vocabulary derives straight
 * from the Prisma enum, so these tests pin the contract.
 */

test("the status vocabulary is the manual-negotiation lifecycle", () => {
  assert.deepEqual(QUOTE_REQUEST_STATUSES, [
    "PENDING",
    "IN_NEGOTIATION",
    "ACCEPTED",
    "REJECTED",
    "CANCELLED",
  ]);
});

test("QUOTED must not exist (no digital quote/counter-offer workflow)", () => {
  // The type system no longer admits "QUOTED" at all, so the runtime check is
  // written against the plain string view of the enum.
  const rawStatuses = QUOTE_REQUEST_STATUSES as readonly string[];
  assert.equal(rawStatuses.includes("QUOTED"), false);
});

test("isQuoteRequestStatus accepts every supported status", () => {
  for (const status of QUOTE_REQUEST_STATUSES) {
    assert.equal(isQuoteRequestStatus(status), true, status);
  }
});

test("isQuoteRequestStatus rejects unknown and removed values", () => {
  assert.equal(isQuoteRequestStatus("QUOTED"), false);
  assert.equal(isQuoteRequestStatus("bogus"), false);
  assert.equal(isQuoteRequestStatus(""), false);
});