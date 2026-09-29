/**
 * Shared read-path for coal specifications.
 *
 * Specifications live in the flexible CoalSpecification table
 * (name / value / unit). The legacy fixed columns on CoalListing
 * (gar / tm / ash / sulfur) are transitional backward-compatibility storage:
 * this module merges those columns under the flexible model so every consumer
 * reads one shape, and explicit CoalSpecification rows always win over the
 * legacy columns. Once every listing has been migrated, the legacy arguments
 * simply stop carrying values and can be dropped along with the columns.
 *
 * Nothing in this module touches the database; it is pure so the merge can be
 * unit tested without a connection.
 */

/** One entry as the API exposes it. `value` is text on purpose (see schema). */
export type SpecificationRow = {
  name: string;
  value: string;
  unit: string | null;
};

/** The transitional fixed columns, pre-serialised by the caller. */
export type LegacySpecValues = {
  gar: string | null;
  tm: string | null;
  ash: string | null;
  sulfur: string | null;
};

/** How the legacy columns map onto the flexible model. */
export const LEGACY_SPECS: readonly {
  key: keyof LegacySpecValues;
  name: string;
  unit: string | null;
}[] = [
  { key: "gar", name: "GAR", unit: "kcal/kg" },
  { key: "tm", name: "TM", unit: "%" },
  { key: "ash", name: "Ash", unit: "%" },
  { key: "sulfur", name: "Sulfur", unit: "%" },
];

/** Names are matched case-insensitively so "gar" and "GAR" are the same spec. */
export function normalizeSpecName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Merges the flexible rows with the legacy columns into a single ordered list.
 *
 * For each legacy name (GAR/TM/Ash/Sulfur) the flexible row wins when present;
 * otherwise the legacy value is surfaced under the same name. Other spec rows
 * (NAR, HGI, ADB, ...) keep their own order and are appended after the legacy
 * block. A listing with nothing at all yields an empty list.
 */
export function combineSpecifications(
  legacy: LegacySpecValues,
  rows: readonly SpecificationRow[],
): SpecificationRow[] {
  const byName = new Map<string, SpecificationRow>();
  for (const row of rows) {
    byName.set(normalizeSpecName(row.name), row);
  }

  const merged: SpecificationRow[] = [];
  for (const legacySpec of LEGACY_SPECS) {
    if (byName.has(legacySpec.key)) continue; // explicit row wins over legacy
    const value = legacy[legacySpec.key];
    if (value === null) continue;
    merged.push({ name: legacySpec.name, value, unit: legacySpec.unit });
  }
  for (const row of rows) merged.push(row);
  return merged;
}

/** Display formatting for a specification value + unit.
 *
 * `value` is text in the data model but almost always numeric. Numeric values
 * keep their thousand separators and up to 3 decimals; word units are spaced
 * ("5,041 kcal/kg") while percentages are tight ("22%"). Non-numeric values
 * (e.g. "Met/As received") render as-is, with the unit when present.
 */
export function formatSpecificationValue(
  value: string,
  unit: string | null,
): string {
  const parsed = Number(value);
  const numeric = Number.isFinite(parsed);
  const formatted = numeric
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(parsed)
    : value;
  if (unit === null || unit === "") return formatted;
  return `${formatted}${unit === "%" ? "" : " "}${unit}`;
}

/**
 * The display label for a listing's coal type.
 *
 * A free-text typeLabel (e.g. "5600 GAR") supersedes the enum for display, and
 * OTHER without a label renders as null so the UI can show a neutral value
 * rather than the word "Other".
 */
export function coalTypeDisplayLabel(
  coalType: string | null,
  typeLabel: string | null,
): string | null {
  const label = typeLabel?.trim();
  if (label !== undefined && label !== "") return label;
  if (coalType === null || coalType === "OTHER") return null;
  return coalType;
}

/** Short display labels for the two product families (buyer-facing). */
export function coalCategoryDisplayLabel(
  category: string | null,
): string | null {
  switch (category) {
    case "LOW_NO_SPEC":
      return "LOW / NO SPEC";
    case "SPEC_COAL":
      return "Batubara Berspesifikasi";
    default:
      return null;
  }
}

/** Labels for the pricing mode. NEGOTIABLE is the only behaviour implemented. */
export function pricingModeDisplayLabel(
  pricingMode: string | null,
): string | null {
  switch (pricingMode) {
    case "NEGOTIABLE":
      return "Negosiasi";
    case "FIXED":
      return "Harga Tetap";
    default:
      return null;
  }
}