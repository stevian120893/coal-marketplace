import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBuyerOfferMessage,
  buildFinalDealMessage,
  buildOfferWhatsAppUrl,
  buildSendDealWhatsAppUrl,
  normalizeWhatsAppPhone,
  SELLER_WHATSAPP_NUMBER,
  type BuyerOfferMessageData,
  type FinalDealMessageData,
} from "../../lib/whatsapp";

/**
 * WhatsApp deep links: plain wa.me URLs with prefilled messages in both human
 * directions of a deal - buyer -> seller (offer follow-up) and seller -> buyer
 * (final deal). No provider, no API call, no secrets.
 */

const DATA: FinalDealMessageData = {
  buyerName: "Andi",
  listingTitle: "Kalimantan Sub-bituminous Coal",
  quantity: "2000.000",
  price: "680000.00",
  paymentTerms: "Cash",
  transactionId: "cmul-transaction-001",
};

const OFFER_DATA: BuyerOfferMessageData = {
  companyName: "PT Bumi Niaga",
  listingTitle: "Kalimantan Sub-bituminous Coal",
  quantity: 2000,
  offerPrice: 650000,
  paymentTerms: "LC at sight",
  notes: "Deliver to Lampung port",
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

// ---------------------------------------------------------------------------
// Buyer -> seller: offer follow-up deep link (bugfix: open seller WhatsApp
// after a successful offer submission).
// ---------------------------------------------------------------------------

test("the seller number is a single centralised constant", () => {
  assert.equal(SELLER_WHATSAPP_NUMBER, "62818232332");
  assert.match(SELLER_WHATSAPP_NUMBER, /^\d+$/);
});

test("the offer message restates the submitted offer in Bahasa Indonesia", () => {
  const message = buildBuyerOfferMessage(OFFER_DATA);
  assert.ok(message.includes("Perusahaan:"));
  assert.ok(message.includes("PT Bumi Niaga"));
  assert.ok(message.includes("Batubara:"));
  assert.ok(message.includes("Kalimantan Sub-bituminous Coal"));
  assert.ok(message.includes("Kuantitas:"));
  assert.ok(message.includes("2,000 MT"));
  assert.ok(message.includes("Harga Penawaran:"));
  assert.ok(message.includes("Rp 650,000 / MT"));
  assert.ok(message.includes("Syarat Pembayaran:"));
  assert.ok(message.includes("LC at sight"));
  assert.ok(message.includes("Catatan:"));
  assert.ok(message.includes("Deliver to Lampung port"));
});

test("the offer message omits absent company, terms and notes lines", () => {
  const message = buildBuyerOfferMessage({
    companyName: null,
    listingTitle: "FINE Lot",
    quantity: 1000.5,
    offerPrice: 680000.5,
    paymentTerms: null,
    notes: null,
  });
  assert.ok(!message.includes("Perusahaan:"));
  assert.ok(!message.includes("Syarat Pembayaran:"));
  assert.ok(!message.includes("Catatan:"));
  // The core commercial facts are still there, with sane number formatting.
  assert.ok(message.includes("FINE Lot"));
  assert.ok(message.includes("1,000.5 MT"));
  assert.ok(message.includes("Rp 680,000.5 / MT"));
});

test("whitespace-only optional offer fields are treated as absent", () => {
  const message = buildBuyerOfferMessage({
    companyName: "   ",
    listingTitle: "ASALAN Lot",
    quantity: 100,
    offerPrice: 500000,
    paymentTerms: " \t ",
    notes: " ",
  });
  assert.ok(!message.includes("Perusahaan:"));
  assert.ok(!message.includes("Syarat Pembayaran:"));
  assert.ok(!message.includes("Catatan:"));
});

test("the offer deep link targets the seller number and is URL-encoded", () => {
  const url = buildOfferWhatsAppUrl(OFFER_DATA);
  assert.ok(url.startsWith(`https://wa.me/${SELLER_WHATSAPP_NUMBER}?text=`));
  // The prefilled text is fully percent-encoded: no raw spaces or newlines.
  assert.ok(!url.includes(" "), "URL must not contain raw spaces");
  assert.ok(!url.includes("\n"), "URL must not contain raw newlines");

  const text = new URL(url).searchParams.get("text");
  assert.equal(text, buildBuyerOfferMessage(OFFER_DATA));
  assert.ok(text !== null && text.includes("PT Bumi Niaga"));
});

test("the offer deep link never exposes secrets or internal identifiers", () => {
  const url = buildOfferWhatsAppUrl(OFFER_DATA);
  for (const secret of ["tokenHash", "AccessToken", "admin_session", "DATABASE_URL", "password"]) {
    assert.ok(!url.includes(secret), `URL must not contain ${secret}`);
  }
  // It carries only what the buyer submitted plus their own identity.
  assert.ok(!url.includes("listingId"));
});
