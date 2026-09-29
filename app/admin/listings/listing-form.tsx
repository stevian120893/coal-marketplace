"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminListingDetail } from "@/lib/quote-requests";

/**
 * Listing create / edit form (client).
 *
 * Basic information plus dynamic CoalSpecification rows (name / value / unit,
 * not hardcoded) and media URL references (photos / COA / videos - direct URLs
 * only; there is no upload infrastructure). A listing is a shared commercial
 * lot, so there is no buyer selector here and none is possible: the server
 * model has no buyer column.
 *
 * The form sends the full desired state; the API replaces specifications and
 * media references wholesale on save. Status is managed separately (publish /
 * unpublish / sold controls), never from this form, and a new listing always
 * starts as a draft.
 */

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";

const labelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300";

type SpecRow = { name: string; value: string; unit: string };
type UrlRow = { url: string };

type ListingFormValues = {
  title: string;
  description: string;
  category: "" | "LOW_NO_SPEC" | "SPEC_COAL";
  coalType: "" | "ASALAN" | "FINE" | "LAMPI" | "OTHER";
  typeLabel: string;
  origin: string;
  pricingMode: "NEGOTIABLE" | "FIXED";
  quantity: string;
  specifications: SpecRow[];
  photos: UrlRow[];
  coas: UrlRow[];
  videos: UrlRow[];
};

type ListingFormProps = {
  mode: "create" | "edit";
  listingId?: string;
  initial?: AdminListingDetail;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

const emptySpec: SpecRow = { name: "", value: "", unit: "" };
const emptyUrl: UrlRow = { url: "" };

function initialValues(initial?: AdminListingDetail): ListingFormValues {
  if (initial === undefined) {
    return {
      title: "",
      description: "",
      category: "",
      coalType: "",
      typeLabel: "",
      origin: "",
      pricingMode: "NEGOTIABLE",
      quantity: "",
      specifications: [emptySpec],
      photos: [],
      coas: [],
      videos: [],
    };
  }
  return {
    title: initial.title,
    description: initial.description ?? "",
    category: initial.category ?? "",
    coalType: initial.coalType ?? "",
    typeLabel: initial.typeLabel ?? "",
    origin: initial.origin ?? "",
    pricingMode: initial.pricingMode,
    quantity: initial.quantity ?? "",
    specifications: initial.specifications.map((spec) => ({
      name: spec.name,
      value: spec.value,
      unit: spec.unit ?? "",
    })),
    photos: initial.photos.map((url) => ({ url })),
    coas: initial.coas.map((url) => ({ url })),
    videos: initial.videos.map((url) => ({ url })),
  };
}

export function ListingForm({ mode, listingId, initial }: ListingFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ListingFormValues>(() =>
    initialValues(initial),
  );
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const set = <K extends keyof ListingFormValues>(
    key: K,
    value: ListingFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  function setSpecRow(index: number, key: keyof SpecRow, value: string) {
    setValues((current) => {
      const rows = current.specifications.slice();
      rows[index] = { ...rows[index], [key]: value };
      return { ...current, specifications: rows };
    });
  }

  function buildPayload() {
    return {
      title: values.title,
      description: values.description.trim() === "" ? null : values.description,
      category: values.category === "" ? null : values.category,
      coalType: values.coalType === "" ? null : values.coalType,
      typeLabel: values.typeLabel.trim() === "" ? null : values.typeLabel,
      origin: values.origin.trim() === "" ? null : values.origin,
      pricingMode: values.pricingMode,
      quantity: values.quantity.trim() === "" ? null : Number(values.quantity),
      specifications: values.specifications
        .filter((row) => row.name.trim() !== "" && row.value.trim() !== "")
        .map((row) => ({
          name: row.name,
          value: row.value,
          unit: row.unit.trim() === "" ? null : row.unit,
        })),
      photos: values.photos.map((row) => row.url.trim()).filter((url) => url !== ""),
      coas: values.coas.map((row) => row.url.trim()).filter((url) => url !== ""),
      videos: values.videos.map((row) => row.url.trim()).filter((url) => url !== ""),
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const url =
      mode === "create"
        ? "/api/admin/listings"
        : `/api/admin/listings/${encodeURIComponent(listingId ?? "")}`;

    try {
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });

      if (!response.ok) {
        let message = "Listing tidak dapat disimpan.";
        try {
          const body = (await response.json()) as { error?: string };
          if (typeof body.error === "string" && body.error.length > 0) {
            message = body.error;
          }
        } catch {
          // Keep the default message when the body is not JSON.
        }
        setState({ status: "error", message });
        return;
      }

      if (mode === "create") {
        const body = (await response.json()) as { listing: { id: string } };
        router.push(`/admin/listings/${body.listing.id}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch {
      setState({
        status: "error",
        message: "Tidak dapat menghubungi server. Silakan coba lagi.",
      });
    }
  }

  const isSubmitting = state.status === "submitting";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="listing-title" className={labelClass}>
          Judul
        </label>
        <input
          id="listing-title"
          type="text"
          required
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          className={inputClass}
          placeholder="mis. Batubara Kalimantan 5.000 kcal/kg, 15.000 MT"
        />
      </div>

      <div>
        <label htmlFor="listing-description" className={labelClass}>
          Deskripsi
        </label>
        <textarea
          id="listing-description"
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          className={inputClass}
          rows={4}
          placeholder="Deskripsi lot, detail pemuatan, dan informasi lain yang perlu diketahui pembeli."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="listing-category" className={labelClass}>
            Kategori
          </label>
          <select
            id="listing-category"
            value={values.category}
            onChange={(event) => set("category", event.target.value as ListingFormValues["category"])}
            className={inputClass}
          >
            <option value="">— Tidak diisi —</option>
            <option value="LOW_NO_SPEC">LOW / NO SPEC</option>
            <option value="SPEC_COAL">Batubara Berspesifikasi</option>
          </select>
        </div>

        <div>
          <label htmlFor="listing-coalType" className={labelClass}>
            Jenis Batubara
          </label>
          <select
            id="listing-coalType"
            value={values.coalType}
            onChange={(event) => set("coalType", event.target.value as ListingFormValues["coalType"])}
            className={inputClass}
          >
            <option value="">— Tidak diisi —</option>
            <option value="ASALAN">ASALAN</option>
            <option value="FINE">FINE</option>
            <option value="LAMPI">LAMPI</option>
            <option value="OTHER">Lainnya</option>
          </select>
        </div>
      </div>

      {values.coalType === "OTHER" ? (
        <div>
          <label htmlFor="listing-typeLabel" className={labelClass}>
            Label Jenis
          </label>
          <input
            id="listing-typeLabel"
            type="text"
            value={values.typeLabel}
            onChange={(event) => set("typeLabel", event.target.value)}
            className={inputClass}
            placeholder="mis. Campuran / Run-of-mine"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="listing-origin" className={labelClass}>
            Asal
          </label>
          <input
            id="listing-origin"
            type="text"
            value={values.origin}
            onChange={(event) => set("origin", event.target.value)}
            className={inputClass}
            placeholder="mis. Kalimantan Selatan"
          />
        </div>

        <div>
          <label htmlFor="listing-quantity" className={labelClass}>
            Kuantitas Tersedia (MT)
          </label>
          <input
            id="listing-quantity"
            type="number"
            min="0"
            step="any"
            value={values.quantity}
            onChange={(event) => set("quantity", event.target.value)}
            className={inputClass}
            placeholder="mis. 15000"
          />
        </div>

        <div>
          <label htmlFor="listing-pricingMode" className={labelClass}>
            Mode Harga
          </label>
          <select
            id="listing-pricingMode"
            value={values.pricingMode}
            onChange={(event) => set("pricingMode", event.target.value as ListingFormValues["pricingMode"])}
            className={inputClass}
          >
            <option value="NEGOTIABLE">Negosiasi</option>
            <option value="FIXED">Harga Tetap</option>
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Spesifikasi Batubara
          </h3>
          <button
            type="button"
            onClick={() =>
              setValues((current) => ({
                ...current,
                specifications: [...current.specifications, emptySpec],
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            + Tambah spesifikasi
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Baris fleksibel (mis. GAR, NAR, TM, Ash, Sulfur, HGI) — nama, nilai,
          dan satuan berupa teks bebas karena spesifikasi baru dapat ditambahkan
          tanpa perubahan skema.
        </p>

        <div className="mt-2 space-y-2">
          {values.specifications.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2"
            >
              <div>
                <label className="sr-only" htmlFor={`spec-name-${index}`}>
                  Nama spesifikasi
                </label>
                <input
                  id={`spec-name-${index}`}
                  type="text"
                  value={row.name}
                  onChange={(event) => setSpecRow(index, "name", event.target.value)}
                  className={inputClass}
                  placeholder="Nama (mis. GAR)"
                />
              </div>
              <div>
                <label className="sr-only" htmlFor={`spec-value-${index}`}>
                  Nilai spesifikasi
                </label>
                <input
                  id={`spec-value-${index}`}
                  type="text"
                  value={row.value}
                  onChange={(event) => setSpecRow(index, "value", event.target.value)}
                  className={inputClass}
                  placeholder="Nilai (mis. 5041)"
                />
              </div>
              <div>
                <label className="sr-only" htmlFor={`spec-unit-${index}`}>
                  Satuan spesifikasi
                </label>
                <input
                  id={`spec-unit-${index}`}
                  type="text"
                  value={row.unit}
                  onChange={(event) => setSpecRow(index, "unit", event.target.value)}
                  className={inputClass}
                  placeholder="Satuan (mis. kcal/kg)"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    specifications: current.specifications.filter(
                      (_, i) => i !== index,
                    ),
                  }))
                }
                aria-label={`Hapus spesifikasi ${index + 1}`}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hapus
              </button>
            </div>
          ))}
        </div>
      </div>

      <UrlListEditor
        title="Foto"
        hint="URL gambar langsung (unggah belum tersedia)."
        rows={values.photos}
        onChange={(rows) => set("photos", rows)}
        placeholder="https://cdn.example.com/foto1.jpg"
      />
      <UrlListEditor
        title="Sertifikat Analisa (COA)"
        hint="URL dokumen langsung."
        rows={values.coas}
        onChange={(rows) => set("coas", rows)}
        placeholder="https://cdn.example.com/contoh-coa.pdf"
      />
      <UrlListEditor
        title="Video"
        hint="URL video langsung."
        rows={values.videos}
        onChange={(rows) => set("videos", rows)}
        placeholder="https://cdn.example.com/tumpukan.mp4"
      />

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
        {mode === "create" ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Listing baru dimulai sebagai draf dan diterbitkan dari layar listing.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function UrlListEditor({
  title,
  hint,
  rows,
  onChange,
  placeholder,
}: {
  title: string;
  hint: string;
  rows: UrlRow[];
  onChange: (rows: UrlRow[]) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </h3>
        <button
          type="button"
          onClick={() => onChange([...rows, emptyUrl])}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          + Tambah URL
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>

      <div className="mt-2 space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="sr-only" htmlFor={`url-${title}-${index}`}>
                {title} URL {index + 1}
              </label>
              <input
                id={`url-${title}-${index}`}
                type="url"
                value={row.url}
                onChange={(event) => {
                  const next = rows.slice();
                  next[index] = { url: event.target.value };
                  onChange(next);
                }}
                className={inputClass}
                placeholder={placeholder}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              aria-label={`Hapus ${title} nomor ${index + 1}`}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Hapus
            </button>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Belum ada entri. Tambahkan untuk mereferensikan sebuah berkas.
          </p>
        ) : null}
      </div>
    </div>
  );
}