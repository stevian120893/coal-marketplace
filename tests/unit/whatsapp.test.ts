import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFinalDealMessage,
  buildSendDealWhatsAppUrl,
  normalizeWhatsAppPhone,
  type FinalDealMessageData,
} from "../../lib/whatsapp";

/**
 * Seller -> buyer WhatsApp deep link: a plain wa.me URL with a prefilled
 * message built from trusted Transaction + Buyer + Listing data. No provider,
 * no API call, no secrets. The buyer's own phone is the recipient and the
 * seller is the sender - the system never sends anything itself.
 */

const DATA: FinalDealMessageData = {
  buyerName: "Andi",
  listingTitle: "Kalimantan Sub-bituminous Coal",
  quantity: "2000.000",
  price: "680000.00",
  paymentTerms: "Cash",
  transactionId: "cmul-transaction-001",
};

test("normalizeWhatsAppPhone keeps only dialling digits with the country code", () => {
  assert.equal(normalizeWhatsAppPhone("+62 813 0000 0000"), "6281300000000");
  assert.equal(normalizeWhatsAppPhone("0813-0000-0000"), "081300000000");
  assert.equal(normalizeWhatsAppPhone("+62813 0000 0000"), "6281300000000");
});

test("normalizeWhatsAppPhone returns null when no usable number exists", () => {
  assert.equal(normalizeWhatsAppPhone(null), null);
  assert.equal(normalizeWhatsAppPhone(""), null);
  assert.equal(normalizeWhatsAppPhone("+() "), null);
});

test("the message identifies the listing, quantity, price, terms and reference", () => {
  const message = buildFinalDealMessage(DATA);
  assert.ok(message.includes("Halo Andi,"));
  assert.ok(message.includes("Kalimantan Sub-bituminous Coal"));
  assert.ok(message.includes("Kuantitas Kesepakatan:"));
  assert.ok(message.includes("2,000 MT"));
  assert.ok(message.includes("Harga Kesepakatan:"));
  assert.ok(message.includes("Rp 680,000 / MT"));
  assert.ok(message.includes("Syarat Pembayaran:"));
  assert.ok(message.includes("Cash"));
  assert.ok(message.includes("Referensi Transaksi:"));
  assert.ok(message.includes("cmul-transaction-001"));
});

test("a missing buyer name falls back to 'Pembeli'", () => {
  const message = buildFinalDealMessage({ ...DATA, buyerName: null });
  assert.ok(message.includes("Halo Pembeli,"));
});

test("payment terms are omitted from the message when not agreed", () => {
  const message = buildFinalDealMessage({ ...DATA, paymentTerms: null });
  assert.ok(!message.includes("Syarat Pembayaran:"));
  assert.ok(message.includes("Referensi Transaksi:"));
});

test("the prefilled message never claims the marketplace sent it", () => {
  const message = buildFinalDealMessage(DATA);
  for (const claim of ["sent", "delivered", "terkirim", "dikirim"]) {
    assert.ok(
      !message.toLowerCase().includes(claim.toLowerCase()),
      `the message must not claim delivery (${claim})`,
    );
  }
});

test("fractional decimals format sensibly in the message", () => {
  const message = buildFinalDealMessage({
    ...DATA,
    quantity: "2000.500",
    price: "680000.50",
  });
  assert.ok(message.includes("2,000.5 MT"));
  assert.ok(message.includes("Rp 680,000.5 / MT"));
});

test("the deep link targets the buyer's phone and is URL-encoded", () => {
  const url = buildSendDealWhatsAppUrl("+62 813 0000 0000", DATA);
  assert.ok(url !== null);
  assert.ok(url.startsWith("https://wa.me/6281300000000?text="));
  // The prefilled text is fully percent-encoded: no raw spaces or newlines.
  assert.ok(!url.includes(" "), "URL must not contain raw spaces");
  assert.ok(!url.includes("\n"), "URL must not contain raw newlines");

  const text = new URL(url).searchParams.get("text");
  assert.equal(text, buildFinalDealMessage(DATA));
});

test("no secrets or internal identifiers reach the link", () => {
  const url = buildSendDealWhatsAppUrl("+62 813 0000 0000", DATA);
  assert.ok(url !== null);
  for (const secret of ["tokenHash", "AccessToken", "admin_session", "DATABASE_URL", "password"]) {
    assert.ok(!url.includes(secret), `URL must not contain ${secret}`);
  }
});

test("no usable phone means no deep link, gracefully", () => {
  assert.equal(buildSendDealWhatsAppUrl(null, DATA), null);
  assert.equal(buildSendDealWhatsAppUrl("+() ", DATA), null);
});