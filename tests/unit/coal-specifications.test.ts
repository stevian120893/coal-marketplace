import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coalCategoryDisplayLabel,
  coalTypeDisplayLabel,
  combineSpecifications,
  formatSpecificationValue,
  normalizeSpecName,
  pricingModeDisplayLabel,
} from "../../lib/coal-specifications";

/**
 * Unit tests for the flexible-specification merge and the display vocabulary
 * shared by the buyer offer page and the admin screens.
 */

test("combineSpecifications: legacy-only listing maps onto the flexible model", () => {
  const merged = combineSpecifications(
    { gar: "5041.00", tm: "22.00", ash: "8.50", sulfur: "0.65" },
    [],
  );
  assert.deepEqual(merged, [
    { name: "GAR", value: "5041.00", unit: "kcal/kg" },
    { name: "TM", value: "22.00", unit: "%" },
    { name: "Ash", value: "8.50", unit: "%" },
    { name: "Sulfur", value: "0.65", unit: "%" },
  ]);
});

test("combineSpecifications: null legacy values are skipped", () => {
  const merged = combineSpecifications(
    { gar: null, tm: "12", ash: null, sulfur: null },
    [],
  );
  assert.deepEqual(merged, [{ name: "TM", value: "12", unit: "%" }]);
});

test("combineSpecifications: explicit rows win over legacy, case-insensitively", () => {
  const merged = combineSpecifications(
    { gar: "5041.00", tm: "22.00", ash: "8.50", sulfur: "0.65" },
    [
      { name: "gar", value: "5200", unit: "kcal/kg" },
      { name: "NAR", value: "4800", unit: "kcal/kg" },
    ],
  );
  assert.deepEqual(merged, [
    { name: "TM", value: "22.00", unit: "%" },
    { name: "Ash", value: "8.50", unit: "%" },
    { name: "Sulfur", value: "0.65", unit: "%" },
    { name: "gar", value: "5200", unit: "kcal/kg" },
    { name: "NAR", value: "4800", unit: "kcal/kg" },
  ]);
  // GAR appears exactly once: the explicit row, not the legacy value.
  const garRows = merged.filter((row) => normalizeSpecName(row.name) === "gar");
  assert.equal(garRows.length, 1);
  assert.equal(garRows[0].value, "5200");
});

test("combineSpecifications: future rows (HGI, ADB) flow through untouched", () => {
  const merged = combineSpecifications(
    { gar: "5041.00", tm: null, ash: null, sulfur: null },
    [
      { name: "HGI", value: "45", unit: null },
      { name: "ADB", value: "5500", unit: "kcal/kg" },
    ],
  );
  assert.deepEqual(merged, [
    { name: "GAR", value: "5041.00", unit: "kcal/kg" },
    { name: "HGI", value: "45", unit: null },
    { name: "ADB", value: "5500", unit: "kcal/kg" },
  ]);
});

test("combineSpecifications: nothing at all yields an empty list", () => {
  assert.deepEqual(
    combineSpecifications({ gar: null, tm: null, ash: null, sulfur: null }, []),
    [],
  );
});

test("combineSpecifications: rows preserve their own insertion order", () => {
  const merged = combineSpecifications(
    { gar: null, tm: null, ash: null, sulfur: null },
    [
      { name: "Sulfur", value: "0.4", unit: "%" },
      { name: "GAR", value: "5000", unit: "kcal/kg" },
    ],
  );
  assert.deepEqual(merged.map((row) => row.name), ["Sulfur", "GAR"]);
});

test("normalizeSpecName is trim + lowercase", () => {
  assert.equal(normalizeSpecName("  GAR "), "gar");
  assert.equal(normalizeSpecName("Ash"), "ash");
});

test("coalTypeDisplayLabel prefers the free text and hides generic OTHER", () => {
  assert.equal(coalTypeDisplayLabel("ASALAN", null), "ASALAN");
  assert.equal(coalTypeDisplayLabel("OTHER", "Thermal blend"), "Thermal blend");
  assert.equal(coalTypeDisplayLabel("OTHER", null), null);
  assert.equal(coalTypeDisplayLabel(null, null), null);
  assert.equal(coalTypeDisplayLabel(null, "Spec coal 5600"), "Spec coal 5600");
});

test("coalCategoryDisplayLabel maps both families", () => {
  assert.equal(coalCategoryDisplayLabel("LOW_NO_SPEC"), "LOW / NO SPEC");
  assert.equal(coalCategoryDisplayLabel("SPEC_COAL"), "Batubara Berspesifikasi");
  assert.equal(coalCategoryDisplayLabel(null), null);
});

test("pricingModeDisplayLabel maps the reserved modes", () => {
  assert.equal(pricingModeDisplayLabel("NEGOTIABLE"), "Negosiasi");
  assert.equal(pricingModeDisplayLabel("FIXED"), "Harga Tetap");
  assert.equal(pricingModeDisplayLabel(null), null);
});

test("formatSpecificationValue formats the migrated legacy values", () => {
  assert.equal(formatSpecificationValue("5041.00", "kcal/kg"), "5,041 kcal/kg");
  assert.equal(formatSpecificationValue("22.00", "%"), "22%");
  assert.equal(formatSpecificationValue("8.50", "%"), "8.5%");
  assert.equal(formatSpecificationValue("0.65", "%"), "0.65%");
});

test("formatSpecificationValue passes non-numeric values through", () => {
  assert.equal(formatSpecificationValue("Met/As received", null), "Met/As received");
  assert.equal(formatSpecificationValue("per sample", "basis"), "per sample basis");
});