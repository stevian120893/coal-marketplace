import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOfferBody } from "../../lib/offer-payload";

/**
 * UI/API consistency contract.
 *
 * The buyer UI must POST exactly the offer shape the server accepts -
 * { listingId, quantity, offerPrice, paymentTerms, notes } - and must never
 * send server-controlled fields (userId / status / transactionId). listingId is
 * the buyer's OWN pick from the shared catalog and is intentionally part of the
 * payload; the server validates it against the database rather than rejecting
 * it for being client-supplied. buildOfferBody is the function the form
 * serialises, so these tests pin the wire shape the same way the validation
 * tests pin the server side.
 */

const SERVER_CONTROLLED_FIELDS = ["userId", "status", "transactionId"] as const;

test("the buyer UI posts exactly the five offer fields", () => {
  const body = buildOfferBody({
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "Cash",
    notes: "Interested in physical inspection",
  });
  assert.deepEqual(body, {
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "Cash",
    notes: "Interested in physical inspection",
  });
});

test("the buyer UI payload never contains server-controlled fields", () => {
  const body = buildOfferBody({
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: null,
    notes: null,
  }) as unknown as Record<string, unknown>;
  const keys = Object.keys(body);
  for (const field of SERVER_CONTROLLED_FIELDS) {
    assert.equal(
      keys.includes(field),
      false,
      `the UI must never send ${field}`,
    );
  }
});

test("blank optional fields are sent as null, not empty strings", () => {
  const body = buildOfferBody({
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "",
    notes: "",
  });
  assert.deepEqual(body, {
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: null,
    notes: null,
  });
});

test("whitespace-only optional fields are trimmed to null", () => {
  const body = buildOfferBody({
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "   ",
    notes: " \t ",
  });
  assert.deepEqual(body, {
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: null,
    notes: null,
  });
});

test("non-blank optional fields and the listing id are trimmed", () => {
  const body = buildOfferBody({
    listingId: "  listing-9  ",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "  Cash  ",
    notes: " Physical inspection requested ",
  });
  assert.deepEqual(body, {
    listingId: "listing-9",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "Cash",
    notes: "Physical inspection requested",
  });
});

test("the payload round-trips a valid offer untouched", () => {
  const input = {
    listingId: "listing-2",
    quantity: 3000,
    offerPrice: 680000,
    paymentTerms: "TT after inspection",
    notes: "Deliver to Lampung port",
  };
  assert.deepEqual(buildOfferBody(input), input);
});

test("the payload is JSON-serialisable to the documented example", () => {
  const body = buildOfferBody({
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "Cash",
    notes: "Interested in physical inspection",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "Cash",
    notes: "Interested in physical inspection",
  });
});