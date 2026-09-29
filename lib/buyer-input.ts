/**
 * Validation for the admin Buyer create/edit payloads
 * (POST /api/admin/buyers, PATCH /api/admin/buyers/[id]).
 *
 * Buyers are User rows whose role is always BUYER: the form is minimal
 * (Nama Perusahaan, Nama Kontak, Nomor Telepon, Email, Status) and the role is a
 * server-controlled column, so this module rejects any payload that tries to
 * create or promote an ADMIN through this interface.
 *
 * Pure module: no database or request plumbing, so every rule is unit-testable.
 */

import type { UserStatus } from "@/lib/quote-requests";
import { isUserStatus } from "@/lib/quote-requests";

export const MAX_COMPANY_NAME_LENGTH = 200;
export const MAX_CONTACT_NAME_LENGTH = 150;
export const MAX_PHONE_LENGTH = 40;
export const MAX_EMAIL_LENGTH = 254;

/** Deliberately a light shape check; full validation is the email's job on
 *  delivery. Catches typos like "alice AT example.com" while accepting all
 *  practical addresses. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BuyerInput = {
  companyName: string;
  name: string | null;
  phone: string | null;
  email: string;
  status: UserStatus;
};

export type BuyerInputParse =
  | { ok: true; value: BuyerInput }
  | { ok: false; error: string };

function fail(error: string): BuyerInputParse {
  return { ok: false, error };
}

type FieldError = { error: string };
function err(error: string): FieldError {
  return { error };
}

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

function readEmail(value: unknown): string | FieldError {
  if (typeof value !== "string") return err("Email wajib diisi.");
  const trimmed = value.trim();
  if (trimmed.length === 0) return err("Email wajib diisi.");
  if (trimmed.length > MAX_EMAIL_LENGTH) return err("Email terlalu panjang.");
  if (!EMAIL_PATTERN.test(trimmed)) return err("Alamat email tidak valid.");
  return trimmed;
}

function readStatus(value: unknown): UserStatus | FieldError {
  if (value === undefined || value === null) return "ACTIVE";
  if (typeof value !== "string" || !isUserStatus(value)) {
    return err("Status pembeli tidak dikenal.");
  }
  return value;
}

/**
 * Parses a buyer create/update payload. The role column is never in the input:
 * a payload that tries to set an ADMIN role is rejected outright, and "BUYER"
 * is accepted only so a role-aware client cannot be tricked into a false
 * success - the route always writes role = BUYER regardless.
 */
export function parseBuyerInput(
  payload: unknown,
): BuyerInputParse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fail("Permintaan tidak valid.");
  }
  const record = payload as Record<string, unknown>;

  if (record.role !== undefined && record.role !== null) {
    if (typeof record.role !== "string" || record.role !== "BUYER") {
      return fail("Peran dikelola oleh marketplace; pembeli selalu berstatus PEMBELI.");
    }
  }

  const companyName = readRequiredText(
    record.companyName,
    "Nama perusahaan",
    MAX_COMPANY_NAME_LENGTH,
  );
  if (typeof companyName === "object") return fail(companyName.error);

  const name = readOptionalText(
    record.name,
    "Nama kontak",
    MAX_CONTACT_NAME_LENGTH,
  );
  if (name !== null && typeof name === "object") return fail(name.error);

  const phone = readOptionalText(record.phone, "Nomor telepon", MAX_PHONE_LENGTH);
  if (phone !== null && typeof phone === "object") return fail(phone.error);

  const email = readEmail(record.email);
  if (typeof email === "object") return fail(email.error);

  const status = readStatus(record.status);
  if (typeof status === "object") return fail(status.error);

  return {
    ok: true,
    value: { companyName, name, phone, email, status },
  };
}