import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LISTING_QUANTITY,
  parseListingInput,
} from "../../lib/listing-input";

/**
 * Unit tests for the admin listing payload validation (POST create and
 * PATCH update share the same parser, differing only in how a status value is
 * treated). Pure rules, no database: quantity scale, enum vocabulary,
 * specification rows, and media URL references are checked here.
 */

test("create accepts a complete valid listing payload", () => {
  const result = parseListingInput(
    {
      title: "Kalimantan coal 5,000 kcal/kg",
      description: "Loaded at Banjarmasin.",
      category: "SPEC_COAL",
      coalType: "OTHER",
      typeLabel: "Run-of-mine",
      origin: "South Kalimantan",
      pricingMode: "FIXED",
      quantity: 472500.5,
      specifications: [
        { name: "GAR", value: "5041", unit: "kcal/kg" },
        { name: "TM", value: "25", unit: "%" },
      ],
      photos: ["https://cdn.example.com/photo1.jpg"],
      coas: ["https://cdn.example.com/coa.pdf"],
      videos: ["https://cdn.example.com/lot.mp4"],
    },
    "create",
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.title, "Kalimantan coal 5,000 kcal/kg");
  assert.equal(result.value.category, "SPEC_COAL");
  assert.equal(result.value.coalType, "OTHER");
  assert.equal(result.value.typeLabel, "Run-of-mine");
  assert.equal(result.value.pricingMode, "FIXED");
  assert.equal(result.value.quantity, 472500.5);
  assert.equal(result.value.status, null);
  assert.deepEqual(result.value.specifications, [
    { name: "GAR", value: "5041", unit: "kcal/kg" },
    { name: "TM", value: "25", unit: "%" },
  ]);
  assert.deepEqual(result.value.photos, ["https://cdn.example.com/photo1.jpg"]);
  assert.deepEqual(result.value.coas, ["https://cdn.example.com/coa.pdf"]);
  assert.deepEqual(result.value.videos, ["https://cdn.example.com/lot.mp4"]);
});

test("create defaults pricingMode to NEGOTIABLE and accepts blank optional text", () => {
  const result = parseListingInput(
    {
      title: "Asalan lot",
      description: "   ",
      typeLabel: "",
      origin: null,
      category: "LOW_NO_SPEC",
      coalType: "ASALAN",
    },
    "create",
  ) as { ok: true; value: { pricingMode: string } };
  assert.equal(result.ok, true);
  assert.equal(result.value.pricingMode, "NEGOTIABLE");
});

test("title is required and length-limited", () => {
  const missing = parseListingInput({}, "create");
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.error, "Judul wajib diisi.");

  const blank = parseListingInput({ title: "   " }, "create");
  assert.equal(blank.ok, false);

  const tooLong = parseListingInput({ title: "x".repeat(201) }, "create");
  assert.equal(tooLong.ok, false);
});

test("unknown category, coal type, and pricing mode are rejected", () => {
  for (const [payload, phrase] of [
    [{ title: "t", category: "PLATINUM" }, "kategori batubara"],
    [{ title: "t", coalType: "SURPRISE" }, "jenis batubara"],
    [{ title: "t", pricingMode: "TBD" }, "mode harga"],
  ] as const) {
    const result = parseListingInput(payload, "create");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error.toLowerCase(), new RegExp(phrase));
  }
});

test("quantity must be a positive number that fits DECIMAL(12,3)", () => {
  const bad: Array<[unknown, string]> = [
    ["5000", "harus berupa angka"],
    [0, "harus lebih dari 0"],
    [-5, "harus lebih dari 0"],
    [MAX_LISTING_QUANTITY + 1, "terlalu besar"],
    [472500.5555, "mendukung maksimal 3 angka desimal"],
  ];
  for (const [value, message] of bad) {
    const result = parseListingInput({ title: "t", quantity: value }, "create");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, new RegExp(message));
  }

  const good = parseListingInput({ title: "t", quantity: 472500.75 }, "create");
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.value.quantity, 472500.75);
});

test("create never accepts a non-DRAFT status; update accepts any known status", () => {
  const publishedOnCreate = parseListingInput(
    { title: "t", status: "PUBLISHED" },
    "create",
  );
  assert.equal(publishedOnCreate.ok, false);
  if (publishedOnCreate.ok) return;
  assert.equal(publishedOnCreate.error, "Listing baru selalu dimulai sebagai draf.");

  const draftOnCreate = parseListingInput({ title: "t", status: "DRAFT" }, "create");
  assert.equal(draftOnCreate.ok, true);

  const publishedOnUpdate = parseListingInput(
    { title: "t", status: "PUBLISHED" },
    "update",
  );
  assert.equal(publishedOnUpdate.ok, true);
  if (publishedOnUpdate.ok) assert.equal(publishedOnUpdate.value.status, "PUBLISHED");

  const bogusOnUpdate = parseListingInput({ title: "t", status: "BOGUS" }, "update");
  assert.equal(bogusOnUpdate.ok, false);
});

test("specification rows are validated and duplicates are rejected", () => {
  const blankName = parseListingInput(
    { title: "t", specifications: [{ name: "  ", value: "5041" }] },
    "create",
  );
  assert.equal(blankName.ok, false);

  const blankValue = parseListingInput(
    { title: "t", specifications: [{ name: "GAR", value: "" }] },
    "create",
  );
  assert.equal(blankValue.ok, false);

  const duplicate = parseListingInput(
    {
      title: "t",
      specifications: [
        { name: "GAR", value: "5041" },
        { name: "gar", value: "5000" },
      ],
    },
    "create",
  );
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.match(duplicate.error, /duplikat/i);

  const notArray = parseListingInput({ title: "t", specifications: {} }, "create");
  assert.equal(notArray.ok, false);

  const tooMany = parseListingInput(
    {
      title: "t",
      specifications: Array.from({ length: 41 }, (_, i) => ({
        name: `Spec ${i}`,
        value: "1",
      })),
    },
    "create",
  );
  assert.equal(tooMany.ok, false);
});

test("media references must be absolute http(s) URLs", () => {
  const ftp = parseListingInput({ title: "t", photos: ["ftp://x/y.jpg"] }, "create");
  assert.equal(ftp.ok, false);

  const notUrl = parseListingInput({ title: "t", videos: ["not a url"] }, "create");
  assert.equal(notUrl.ok, false);

  const blank = parseListingInput({ title: "t", coas: [""] }, "create");
  assert.equal(blank.ok, false);

  const notList = parseListingInput({ title: "t", photos: "https://x/y.jpg" }, "create");
  assert.equal(notList.ok, false);

  const tooMany = parseListingInput(
    {
      title: "t",
      photos: Array.from({ length: 21 }, (_, i) => `https://cdn.example.com/${i}.jpg`),
    },
    "create",
  );
  assert.equal(tooMany.ok, false);
});

test("non-object bodies are rejected", () => {
  for (const body of [null, "text", 42, ["array"]]) {
    assert.equal(parseListingInput(body, "create").ok, false);
  }
});