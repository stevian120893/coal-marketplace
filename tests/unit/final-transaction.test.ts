import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FINAL_PAYMENT_TERMS_LENGTH,
  MAX_TRANSACTION_PRICE,
  MAX_TRANSACTION_QUANTITY,
  parseFinalTransactionInput,
} from "../../lib/final-transaction";

/**
 * Finalisasi Kesepakatan payload contract: a valid final deal carries quantity,
 * price and optional payment terms. Identity fields
 * (quoteRequestId / userId / coalListingId) and status are server-controlled - a
 * client that sends them is ignored, never honoured - and money/quantity must
 * fit the DECIMAL(14,2) / DECIMAL(12,3) columns exactly.
 *
 * Rejection messages are asserted in Bahasa Indonesia because that exact
 * sentence is what the admin reads under the finalization form.
 */

test("a valid final deal parses with the negotiated numbers", () => {
  const parsed = parseFinalTransactionInput({
    quantity: 2000,
    price: 680000,
    paymentTerms: "Cash",
  });
  assert.deepEqual(parsed, {
    ok: true,
    value: { quantity: 2000, price: 680000, paymentTerms: "Cash" },
  });
});

test("payment terms are optional and blank means not provided", () => {
  assert.deepEqual(parseFinalTransactionInput({ quantity: 2000, price: 680000 }), {
    ok: true,
    value: { quantity: 2000, price: 680000, paymentTerms: null },
  });
  assert.deepEqual(
    parseFinalTransactionInput({
      quantity: 2000,
      price: 680000,
      paymentTerms: "  ",
    }),
    { ok: true, value: { quantity: 2000, price: 680000, paymentTerms: null } },
  );
});

test("server-controlled fields are ignored, never honoured", () => {
  const parsed = parseFinalTransactionInput({
    quantity: 2000,
    price: 680000,
    quoteRequestId: "spoofed",
    userId: "spoofed",
    coalListingId: "spoofed",
    status: "COMPLETED",
  });
  assert.deepEqual(parsed, {
    ok: true,
    value: { quantity: 2000, price: 680000, paymentTerms: null },
  });
});

test("non-object bodies are rejected", () => {
  for (const payload of [null, "text", 42, [], undefined, true]) {
    const parsed = parseFinalTransactionInput(payload);
    assert.equal(parsed.ok, false, JSON.stringify(payload));
    if (!parsed.ok) assert.equal(parsed.error, "Permintaan tidak valid.");
  }
});

test("quantity is required and must be positive", () => {
  const missing = parseFinalTransactionInput({ price: 680000 });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error, "Kuantitas kesepakatan wajib diisi.");
  }
  assert.equal(parseFinalTransactionInput({ quantity: 0, price: 680000 }).ok, false);
  assert.equal(
    parseFinalTransactionInput({ quantity: -10, price: 680000 }).ok,
    false,
  );
  const asText = parseFinalTransactionInput({ quantity: "2000", price: 680000 });
  assert.equal(asText.ok, false);
  if (!asText.ok) {
    assert.equal(asText.error, "Kuantitas kesepakatan harus berupa angka.");
  }
});

test("quantity must fit the DECIMAL(12,3) column exactly", () => {
  const parsed = parseFinalTransactionInput({
    quantity: 2000.0005,
    price: 680000,
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(
      parsed.error,
      "Kuantitas kesepakatan mendukung maksimal 3 angka desimal.",
    );
  }
});

test("price is required and must be positive", () => {
  const missing = parseFinalTransactionInput({ quantity: 2000 });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, "Harga kesepakatan wajib diisi.");

  const zero = parseFinalTransactionInput({ quantity: 2000, price: 0 });
  assert.equal(zero.ok, false);
  if (!zero.ok) {
    assert.equal(zero.error, "Harga kesepakatan harus lebih dari 0.");
  }
  assert.equal(parseFinalTransactionInput({ quantity: 2000, price: -1 }).ok, false);
});

test("price must fit the DECIMAL(14,2) column exactly", () => {
  const parsed = parseFinalTransactionInput({ quantity: 2000, price: 680000.005 });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(
      parsed.error,
      "Harga kesepakatan mendukung maksimal 2 angka desimal.",
    );
  }
});

test("payment terms must be a string within the length limit", () => {
  const asNumber = parseFinalTransactionInput({
    quantity: 2000,
    price: 680000,
    paymentTerms: 42,
  });
  assert.equal(asNumber.ok, false);
  if (!asNumber.ok) {
    assert.equal(asNumber.error, "Syarat pembayaran harus berupa teks.");
  }

  const long = "x".repeat(MAX_FINAL_PAYMENT_TERMS_LENGTH + 1);
  const tooLong = parseFinalTransactionInput({
    quantity: 2000,
    price: 680000,
    paymentTerms: long,
  });
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) {
    assert.equal(tooLong.error, "Syarat pembayaran terlalu panjang.");
  }

  const atLimit = parseFinalTransactionInput({
    quantity: 2000,
    price: 680000,
    paymentTerms: "x".repeat(MAX_FINAL_PAYMENT_TERMS_LENGTH),
  });
  assert.equal(atLimit.ok, true);
});

test("excessive magnitudes are rejected before touching the database", () => {
  const quantity = parseFinalTransactionInput({
    quantity: MAX_TRANSACTION_QUANTITY + 1,
    price: 680000,
  });
  assert.equal(quantity.ok, false);
  if (!quantity.ok) assert.equal(quantity.error, "Kuantitas kesepakatan terlalu besar.");

  const price = parseFinalTransactionInput({
    quantity: 2000,
    price: MAX_TRANSACTION_PRICE + 1,
  });
  assert.equal(price.ok, false);
  if (!price.ok) assert.equal(price.error, "Harga kesepakatan terlalu besar.");
});

test("a transaction price differs from an offer price: both values survive", () => {
  const parsed = parseFinalTransactionInput({ quantity: 2000, price: 680000 });
  assert.deepEqual(parsed, {
    ok: true,
    value: { quantity: 2000, price: 680000, paymentTerms: null },
  });
  // The offer's own 650000 stays the offer's business; this parser only ever
  // produces the final-deal price.
  assert.notEqual(parsed.ok ? parsed.value.price : 0, 650000);
});
