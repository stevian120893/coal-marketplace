/**
 * Validation for the admin Coal Listing create/edit payloads
 * (POST /api/admin/listings, PATCH /api/admin/listings/[id]).
 *
 * Mirror module of lib/buyer-offer.ts and lib/final-transaction.ts with the
 * same number rules: quantity is only accepted when it maps exactly onto the
 * DECIMAL(12,3) column, and the route always persists through Prisma's Decimal
 * type. Flexible specifications and media URL references are validated here as
 * well, so a malformed row is rejected before it reaches the database.
 *
 * Pure module: no database or request plumbing, so every rule is unit-testable.
 */

import type {
  CoalCategory,
  CoalType,
  ListingStatus,
  PricingMode,
} from "@/lib/quote-requests";
import {
  isCoalCategory,
  isCoalType,
  isListingStatus,
  isPricingMode,
} from "@/lib/quote-requests";

export const MAX_LISTING_TITLE_LENGTH = 200;
export const MAX_LISTING_DESCRIPTION_LENGTH = 4000;
export const MAX_TYPE_LABEL_LENGTH = 120;
export const MAX_ORIGIN_LENGTH = 200;
export const MAX_SPEC_ROWS = 40;
export const MAX_SPEC_NAME_LENGTH = 60;
export const MAX_SPEC_VALUE_LENGTH = 200;
export const MAX_SPEC_UNIT_LENGTH = 30;
export const MAX_MEDIA_URLS = 20;
export const MAX_MEDIA_URL_LENGTH = 2048;

/** Ceiling of the DECIMAL(12,3) quantity column: 999,999,999.999. */
export const MAX_LISTING_QUANTITY = 999_999_999.999;

/** Relative tolerance for the "fits the column's scale" checks. */
const SCALE_EPSILON = 1e-9;

type FieldError = { error: string };

function err(error: string): FieldError {
  return { error };
}

/**
 * Reads a required text field; returns { error } when missing or too long.
 *
 * `label` is the Indonesian field label shown to the admin, so the message reads
 * like a form instruction instead of a developer log line.
 */
function readRequiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string | FieldError {
  if (typeof value !== "string") return err(`${label} wajib diisi.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return err(`${label} wajib diisi.`);
  if (trimmed.length > maxLength) return err(`${label} terlalu panjang.`);
  return trimmed;
}

/**
 * Reads an optional text field. Blank and null both mean "not provided".
 * Returns { error } when present but the wrong type or too long.
 */
function readOptionalText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null | FieldError {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return err(`${label} harus berupa teks.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return err(`${label} terlalu panjang.`);
  return trimmed;
}

/**
 * A number must be exactly representable at the column's scale: 680000 or
 * 472500.75 is fine, 472.5005 is rejected instead of being silently rounded.
 */
function readScaledNumber(
  value: unknown,
  label: string,
  max: number,
  scale: number,
): number | FieldError {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return err(`${label} harus berupa angka.`);
  }
  if (value <= 0) return err(`${label} harus lebih dari 0.`);
  if (value > max) return err(`${label} terlalu besar.`);
  const rounded = Math.round(value * 10 ** scale) / 10 ** scale;
  if (Math.abs(rounded - value) > SCALE_EPSILON) {
    return err(`${label} mendukung maksimal ${scale} angka desimal.`);
  }
  return rounded;
}

/** Absolute http(s) asset URLs only - media references, never uploads. */
function readUrlList(value: unknown, label: string): string[] | FieldError {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return err(`${label} harus berupa daftar URL.`);
  if (value.length > MAX_MEDIA_URLS) {
    return err(`${label} memiliki terlalu banyak entri.`);
  }

  const urls: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return err(`${label} harus berupa teks.`);
    const trimmed = entry.trim();
    if (trimmed.length === 0) return err(`${label} memiliki entri kosong.`);
    if (trimmed.length > MAX_MEDIA_URL_LENGTH) {
      return err(`${label} memiliki URL yang terlalu panjang.`);
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return err(`${label} memiliki URL yang tidak valid.`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err(`${label} harus menggunakan URL http atau https.`);
    }
    urls.push(trimmed);
  }
  return urls;
}

export type ListingSpecInput = {
  name: string;
  value: string;
  unit: string | null;
};

function readSpecifications(value: unknown): ListingSpecInput[] | FieldError {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return err("Spesifikasi harus berupa daftar.");
  if (value.length > MAX_SPEC_ROWS) {
    return err("Terlalu banyak baris spesifikasi.");
  }

  const rows: ListingSpecInput[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      return err("Setiap spesifikasi harus berupa objek.");
    }
    const record = entry as Record<string, unknown>;

    const name = readRequiredText(
      record.name,
      "Nama spesifikasi",
      MAX_SPEC_NAME_LENGTH,
    );
    if (typeof name === "object") return name;
    const valueText = readRequiredText(
      record.value,
      "Nilai spesifikasi",
      MAX_SPEC_VALUE_LENGTH,
    );
    if (typeof valueText === "object") return valueText;
    const unit = readOptionalText(
      record.unit,
      "Satuan spesifikasi",
      MAX_SPEC_UNIT_LENGTH,
    );
    if (unit !== null && typeof unit === "object") return unit;

    const key = name.trim().toLowerCase();
    if (seen.has(key)) return err(`Spesifikasi duplikat: ${name}.`);
    seen.add(key);
    rows.push({ name, value: valueText, unit });
  }
  return rows;
}

export type ListingInput = {
  title: string;
  description: string | null;
  category: CoalCategory | null;
  coalType: CoalType | null;
  typeLabel: string | null;
  origin: string | null;
  pricingMode: PricingMode;
  quantity: number | null;
  /** Only meaningful on update; create always writes DRAFT. */
  status: ListingStatus | null;
  specifications: ListingSpecInput[];
  photos: string[];
  coas: string[];
  videos: string[];
};

export type ListingInputParse =
  | { ok: true; value: ListingInput }
  | { ok: false; error: string };

function fail(error: string): ListingInputParse {
  return { ok: false, error };
}

/**
 * Parses a listing create/update payload.
 *
 * On create, a provided status must be DRAFT (the server always starts new
 * listings as drafts). On update, status is optional and the route checks the
 * transition separately through lib/listing-status.ts before persisting.
 */
export function parseListingInput(
  payload: unknown,
  mode: "create" | "update",
): ListingInputParse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fail("Permintaan tidak valid.");
  }
  const record = payload as Record<string, unknown>;

  const title = readRequiredText(record.title, "Judul", MAX_LISTING_TITLE_LENGTH);
  if (typeof title === "object") return fail(title.error);

  const description = readOptionalText(
    record.description,
    "Deskripsi",
    MAX_LISTING_DESCRIPTION_LENGTH,
  );
  if (description !== null && typeof description === "object") return fail(description.error);

  const typeLabel = readOptionalText(
    record.typeLabel,
    "Label jenis",
    MAX_TYPE_LABEL_LENGTH,
  );
  if (typeLabel !== null && typeof typeLabel === "object") return fail(typeLabel.error);

  const origin = readOptionalText(record.origin, "Asal", MAX_ORIGIN_LENGTH);
  if (origin !== null && typeof origin === "object") return fail(origin.error);

  let category: CoalCategory | null = null;
  if (record.category !== undefined && record.category !== null) {
    if (typeof record.category !== "string" || !isCoalCategory(record.category)) {
      return fail("Kategori batubara tidak dikenal.");
    }
    category = record.category;
  }

  let coalType: CoalType | null = null;
  if (record.coalType !== undefined && record.coalType !== null) {
    if (typeof record.coalType !== "string" || !isCoalType(record.coalType)) {
      return fail("Jenis batubara tidak dikenal.");
    }
    coalType = record.coalType;
  }

  let pricingMode: PricingMode = "NEGOTIABLE";
  if (record.pricingMode !== undefined && record.pricingMode !== null) {
    if (typeof record.pricingMode !== "string" || !isPricingMode(record.pricingMode)) {
      return fail("Mode harga tidak dikenal.");
    }
    pricingMode = record.pricingMode;
  }

  let quantity: number | null = null;
  if (record.quantity !== undefined && record.quantity !== null) {
    const quantityRead = readScaledNumber(
      record.quantity,
      "Kuantitas",
      MAX_LISTING_QUANTITY,
      3,
    );
    if (typeof quantityRead === "object") return fail(quantityRead.error);
    quantity = quantityRead;
  }

  let status: ListingStatus | null = null;
  if (record.status !== undefined && record.status !== null) {
    if (typeof record.status !== "string" || !isListingStatus(record.status)) {
      return fail("Status listing tidak dikenal.");
    }
    if (mode === "create" && record.status !== "DRAFT") {
      return fail("Listing baru selalu dimulai sebagai draf.");
    }
    status = record.status;
  }

  const specifications = readSpecifications(record.specifications);
  if (typeof specifications === "object" && "error" in specifications) {
    return fail(specifications.error);
  }

  const photos = readUrlList(record.photos, "Foto");
  if (typeof photos === "object" && "error" in photos) return fail(photos.error);

  const coas = readUrlList(record.coas, "Dokumen COA");
  if (typeof coas === "object" && "error" in coas) return fail(coas.error);

  const videos = readUrlList(record.videos, "Video");
  if (typeof videos === "object" && "error" in videos) return fail(videos.error);

  return {
    ok: true,
    value: {
      title,
      description,
      category,
      coalType,
      typeLabel,
      origin,
      pricingMode,
      quantity,
      status,
      specifications,
      photos,
      coas,
      videos,
    },
  };
}