"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

/**
 * Buyer create / edit form (client).
 *
 * Minimal identity form: Company Name, Contact Name, Phone, Email, Status.
 * There is no role field - buyers are always BUYER and the server enforces it,
 * so the client cannot even attempt an ADMIN creation here. Posts the JSON
 * body to /api/admin/buyers (create) or /api/admin/buyers/[id] (edit); the
 * admin session cookie is sent by the browser automatically.
 */

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";

const labelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

type BuyerFormValues = {
  companyName: string;
  name: string;
  phone: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
};

type BuyerFormProps = {
  mode: "create" | "edit";
  buyerId?: string;
  initial?: BuyerFormValues;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export function BuyerForm({ mode, buyerId, initial }: BuyerFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<BuyerFormValues>(
    initial ?? {
      companyName: "",
      name: "",
      phone: "",
      email: "",
      status: "ACTIVE",
    },
  );
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const set = (key: keyof BuyerFormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const url = withBasePath(
      mode === "create"
        ? "/api/admin/buyers"
        : `/api/admin/buyers/${encodeURIComponent(buyerId ?? "")}`,
    );

    // The finally block always exits the loading state, so the button can
    // never stay stuck on "Menyimpan…". On edit, router.refresh() re-renders
    // the server data but deliberately keeps this component's useState intact,
    // so an edit that never reset "submitting" would leave the form disabled
    // forever even though the save succeeded.
    let errorMessage: string | null = null;

    try {
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        let message = "Data pembeli tidak dapat disimpan.";
        try {
          const body = (await response.json()) as { error?: string };
          if (typeof body.error === "string" && body.error.length > 0) {
            message = body.error;
          }
        } catch {
          // Keep the default message when the body is not JSON.
        }
        errorMessage = message;
        return;
      }

      if (mode === "create") {
        const body = (await response.json()) as {
          buyer: { id: string };
        };
        router.push(`/admin/buyers/${body.buyer.id}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch {
      errorMessage = "Tidak dapat menghubungi server. Silakan coba lagi.";
    } finally {
      setState(
        errorMessage === null
          ? { status: "idle" }
          : { status: "error", message: errorMessage },
      );
    }
  }

  const isSubmitting = state.status === "submitting";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="companyName" className={labelClass}>
          Nama Perusahaan
        </label>
        <input
          id="companyName"
          type="text"
          required
          value={values.companyName}
          onChange={(event) => set("companyName", event.target.value)}
          className={inputClass}
          placeholder="PT Bumi Niaga"
        />
      </div>

      <div>
        <label htmlFor="name" className={labelClass}>
          Nama Kontak
        </label>
        <input
          id="name"
          type="text"
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          className={inputClass}
          placeholder="Nama kontak pembeli"
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Nomor Telepon
        </label>
        <input
          id="phone"
          type="tel"
          value={values.phone}
          onChange={(event) => set("phone", event.target.value)}
          className={inputClass}
          placeholder="+62 811 0000 0000"
        />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={values.email}
          onChange={(event) => set("email", event.target.value)}
          className={inputClass}
          placeholder="buyer@company.com"
        />
      </div>

      <div>
        <label htmlFor="status" className={labelClass}>
          Status
        </label>
        <select
          id="status"
          value={values.status}
          onChange={(event) => set("status", event.target.value)}
          className={inputClass}
        >
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Tidak Aktif</option>
        </select>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Pembeli yang tidak aktif tetap menyimpan datanya, tetapi tidak dapat
          diberi tautan akses baru.
        </p>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {isSubmitting
            ? "Menyimpan…"
            : mode === "create"
              ? "Simpan"
              : "Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}