import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBuyerInput } from "../../lib/buyer-input";

/**
 * Unit tests for the admin Buyer payload validation (create and edit share
 * the parser). The role column is server-controlled: this module rejects any
 * attempt to create or promote an ADMIN through the buyer interface.
 */

test("create accepts a complete valid buyer payload", () => {
  const result = parseBuyerInput({
    companyName: "PT Bumi Niaga",
    name: "Buyer Contact",
    phone: "+62 813 0000 0000",
    email: "buyer@company.com",
    status: "ACTIVE",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    companyName: "PT Bumi Niaga",
    name: "Buyer Contact",
    phone: "+62 813 0000 0000",
    email: "buyer@company.com",
    status: "ACTIVE",
  });
});

test("buyer status defaults to ACTIVE", () => {
  const result = parseBuyerInput({
    companyName: "PT Bumi Niaga",
    email: "buyer@company.com",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.status, "ACTIVE");
});

test("contact name and phone are optional", () => {
  const result = parseBuyerInput({
    companyName: "PT Bumi Niaga",
    email: "buyer@company.com",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, null);
  assert.equal(result.value.phone, null);
});

test("the role column cannot be set to ADMIN through the buyer interface", () => {
  const adminAttempt = parseBuyerInput({
    companyName: "PT Bumi Niaga",
    email: "buyer@company.com",
    role: "ADMIN",
  });
  assert.equal(adminAttempt.ok, false);
  if (adminAttempt.ok) return;
  assert.equal(
    adminAttempt.error,
    "Peran dikelola oleh marketplace; pembeli selalu berstatus PEMBELI.",
  );

  const weaponsGrade = parseBuyerInput({
    companyName: "PT Bumi Niaga",
    email: "buyer@company.com",
    role: "SUPERADMIN",
  });
  assert.equal(weaponsGrade.ok, false);
});

test("buyer role = BUYER is accepted explicitly", () => {
  const result = parseBuyerInput({
    companyName: "PT Bumi Niaga",
    email: "buyer@company.com",
    role: "BUYER",
  });
  assert.equal(result.ok, true);
});

test("company name is required and length-limited", () => {
  const missing = parseBuyerInput({ email: "buyer@company.com" });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.error, "Nama perusahaan wajib diisi.");

  const blank = parseBuyerInput({ companyName: " ", email: "buyer@company.com" });
  assert.equal(blank.ok, false);

  const tooLong = parseBuyerInput({
    companyName: "x".repeat(201),
    email: "buyer@company.com",
  });
  assert.equal(tooLong.ok, false);
});

test("email is required, shape-checked, and length-limited", () => {
  const missing = parseBuyerInput({ companyName: "PT" });
  assert.equal(missing.ok, false);

  const invalid = parseBuyerInput({
    companyName: "PT",
    email: "alice AT company dot com",
  });
  assert.equal(invalid.ok, false);

  const tooLong = parseBuyerInput({
    companyName: "PT",
    email: `${"a".repeat(250)}@company.com`,
  });
  assert.equal(tooLong.ok, false);
});

test("unknown buyer statuses are rejected", () => {
  const result = parseBuyerInput({
    companyName: "PT",
    email: "buyer@company.com",
    status: "BANNED",
  });
  assert.equal(result.ok, false);
});

test("non-object bodies are rejected", () => {
  for (const body of [null, "text", 42, ["array"]]) {
    assert.equal(parseBuyerInput(body).ok, false);
  }
});