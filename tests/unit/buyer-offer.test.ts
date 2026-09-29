import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LISTING_ID_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_OFFER_PRICE,
  MAX_PAYMENT_TERMS_LENGTH,
  MAX_QUANTITY,
  parseBuyerOffer,
} from "../../lib/buyer-offer";

/**
 * Unit tests for the buyer offer payload validation. All cases that do not need
 * a database (shape, types, ranges, scale, and spoof-rejection) live here; the
 * quantity-vs-available and the listing-exists checks need the database and
 * live in the integration suite.
 *
 * Every rejection message is asserted in Bahasa Indonesia, because that exact
 * sentence is what the buyer reads under the offer form.
 */

const validInput = {
  listingId: "listing-1",
  quantity: 2000,
  offerPrice: 650000,
  paymentTerms: "Cash",
  notes: "Interested in physical inspection",
};

function expectRejected(payload: unknown, pattern: RegExp | string): void {
  const result = parseBuyerOffer(payload);
  assert.equal(result.ok, false, "expected the payload to be rejected");
  if (!result.ok) {
    if (typeof pattern === "string") {
      assert.match(result.error, new RegExp(pattern));
    } else {
      assert.match(result.error, pattern);
    }
  }
}

test("accepts a well-formed buyer offer", () => {
  const result = parseBuyerOffer(validInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, validInput);
});

test("rejects quantity <= 0", () => {
  expectRejected({ ...validInput, quantity: 0 }, "harus lebih dari 0");
  expectRejected({ ...validInput, quantity: -5 }, "harus lebih dari 0");
});

test("rejects a missing quantity", () => {
  const { quantity: _drop, ...rest } = validInput;
  void _drop;
  expectRejected(rest, "Kuantitas wajib diisi");
  expectRejected({ ...validInput, quantity: null }, "Kuantitas wajib diisi");
});

test("rejects a non-number quantity", () => {
  expectRejected({ ...validInput, quantity: "2000" }, "Kuantitas harus berupa angka");
  expectRejected({ ...validInput, quantity: Number.NaN }, "Kuantitas harus berupa angka");
  expectRejected(
    { ...validInput, quantity: Number.POSITIVE_INFINITY },
    "Kuantitas harus berupa angka",
  );
});

test("rejects a quantity above the DECIMAL(12,3) ceiling", () => {
  expectRejected({ ...validInput, quantity: MAX_QUANTITY + 1 }, "terlalu besar");
});

test("rejects a quantity with more than 3 decimal places", () => {
  expectRejected(
    { ...validInput, quantity: 2000.1234 },
    "mendukung maksimal 3 angka desimal",
  );
  assert.equal(parseBuyerOffer({ ...validInput, quantity: 2000.125 }).ok, true);
});

test("rejects a missing offerPrice", () => {
  const { offerPrice: _drop, ...rest } = validInput;
  void _drop;
  expectRejected(rest, "Harga penawaran wajib diisi");
  expectRejected(
    { ...validInput, offerPrice: null },
    "Harga penawaran wajib diisi",
  );
});

test("rejects offerPrice <= 0", () => {
  expectRejected({ ...validInput, offerPrice: 0 }, "harus lebih dari 0");
  expectRejected({ ...validInput, offerPrice: -100 }, "harus lebih dari 0");
});

test("rejects a non-number offerPrice", () => {
  expectRejected(
    { ...validInput, offerPrice: "650000" },
    "Harga penawaran harus berupa angka",
  );
  expectRejected(
    { ...validInput, offerPrice: Number.NaN },
    "Harga penawaran harus berupa angka",
  );
});

test("rejects an offerPrice above the DECIMAL(14,2) ceiling", () => {
  expectRejected({ ...validInput, offerPrice: MAX_OFFER_PRICE + 1 }, "terlalu besar");
});

test("rejects an offerPrice with more than 2 decimal places", () => {
  // 650000.005 would be silently rounded by DECIMAL(14,2); it must be rejected.
  expectRejected(
    { ...validInput, offerPrice: 650000.005 },
    "mendukung maksimal 2 angka desimal",
  );
  assert.equal(parseBuyerOffer({ ...validInput, offerPrice: 650000.25 }).ok, true);
  // A float-friendly value such as 0.29 accepts cleanly (no float artifact).
  assert.equal(parseBuyerOffer({ ...validInput, offerPrice: 0.29 }).ok, true);
});

test("rejects invalid paymentTerms and notes types", () => {
  expectRejected(
    { ...validInput, paymentTerms: 42 },
    "Syarat pembayaran harus berupa teks",
  );
  expectRejected(
    { ...validInput, paymentTerms: ["Cash"] },
    "Syarat pembayaran harus berupa teks",
  );
  expectRejected({ ...validInput, notes: {} }, "Catatan harus berupa teks");
  expectRejected({ ...validInput, notes: 123 }, "Catatan harus berupa teks");
});

test("rejects over-long paymentTerms and notes", () => {
  expectRejected(
    { ...validInput, paymentTerms: "x".repeat(MAX_PAYMENT_TERMS_LENGTH + 1) },
    "Syarat pembayaran terlalu panjang",
  );
  expectRejected(
    { ...validInput, notes: "x".repeat(MAX_NOTES_LENGTH + 1) },
    "Catatan terlalu panjang",
  );
});

test("treats blank and null paymentTerms and notes as not provided", () => {
  const result = parseBuyerOffer({
    listingId: "listing-1",
    quantity: 2000,
    offerPrice: 650000,
    paymentTerms: "",
    notes: null,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.paymentTerms, null);
  assert.equal(result.value.notes, null);
});

test("rejects a body that tries to spoof userId", () => {
  expectRejected(
    { ...validInput, userId: "someone-else" },
    "Permintaan tidak valid",
  );
  expectRejected({ ...validInput, userId: null }, "Permintaan tidak valid");
});

test("listingId is required and must be a non-blank string", () => {
  const { listingId: _drop, ...rest } = validInput;
  void _drop;
  expectRejected(rest, "Permintaan tidak valid");
  expectRejected({ ...validInput, listingId: null }, "Permintaan tidak valid");
  expectRejected({ ...validInput, listingId: "" }, "Permintaan tidak valid");
  expectRejected({ ...validInput, listingId: "   " }, "Permintaan tidak valid");
  expectRejected({ ...validInput, listingId: 42 }, "Permintaan tidak valid");
});

test("listingId is accepted as the buyer's own pick (not server-controlled)", () => {
  // The buyer-wide link identifies the buyer; the buyer chooses the listing.
  assert.equal(parseBuyerOffer({ ...validInput, listingId: "  listing-9  " }).ok, true);
});

test("rejects an over-long listingId", () => {
  expectRejected(
    { ...validInput, listingId: "x".repeat(MAX_LISTING_ID_LENGTH + 1) },
    "Permintaan tidak valid",
  );
});

test("rejects a body that tries to set status", () => {
  expectRejected({ ...validInput, status: "ACCEPTED" }, "Permintaan tidak valid");
});

test("rejects a body that tries to set transactionId", () => {
  expectRejected(
    { ...validInput, transactionId: "tx-1" },
    "Permintaan tidak valid",
  );
});

test("rejects a non-object body", () => {
  expectRejected(null, "Permintaan tidak valid");
  expectRejected([], "Permintaan tidak valid");
  expectRejected("quantity=1", "Permintaan tidak valid");
  expectRejected(42, "Permintaan tidak valid");
});

test("rejects an empty object", () => {
  expectRejected({}, "Permintaan tidak valid");
});

test("no rejection message leaks an English sentence", () => {
  for (const payload of [
    null,
    {},
    { ...validInput, quantity: 0 },
    { ...validInput, offerPrice: "x" },
    { ...validInput, notes: 5 },
    { ...validInput, userId: "spoof" },
  ]) {
    const result = parseBuyerOffer(payload);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.ok(
      !/\b(is required|must be|too long|too large|invalid|should)\b/.test(
        result.error,
      ),
      `unexpected English message: ${result.error}`,
    );
  }
});
