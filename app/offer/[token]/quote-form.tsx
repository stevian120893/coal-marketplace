"use client";

import { useState } from "react";
import { MAX_NOTES_LENGTH, MAX_OFFER_PRICE, MAX_PAYMENT_TERMS_LENGTH } from "@/lib/buyer-offer";
import { buildOfferBody } from "@/lib/offer-payload";
import { withBasePath } from "@/lib/base-path";

/**
 * Buyer offer form. Posts to the quote endpoint, which derives the buyer from
 * the access token and validates the buyer's chosen listing (sent as
 * `listingId`), so nothing identifying is sent from here.
 *
 * The buyer enters quantity, their offer price per MT (Harga Penawaran Anda),
 * payment terms, and notes. This is the buyer's INITIAL proposal - the seller
 * negotiates manually afterwards, so no counter-offer flow exists here.
 *
 * On success the form switches to a confirmation panel inside the dialog: it
 * restates the selected listing and what was submitted, and explicitly says
 * the seller will follow up. Nothing here implies an order or transaction -
 * only an offer was made.
 */

function formatNumber(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

type QuoteFormProps = {
  token: string;
  listingId: string;
  listingTitle: string;
  availableQuantity: number | null;
  availableQuantityLabel: string;
  onClose: () => void;
  onSubmitted: (quoteRequestId: string) => void;
};

type SubmittedSummary = {
  listingId: string;
  listingTitle: string;
  quantity: number;
  offerPrice: number;
  paymentTerms: string | null;
  notes: string | null;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success"; quoteRequestId: string; summary: SubmittedSummary };

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";

/** A price must fit DECIMAL(14,2): at most two decimal places. */
function fitsTwoDecimals(value: number): boolean {
  return Math.abs(value - Math.round(value * 100) / 100) <= 1e-9;
}

export function QuoteForm({
  token,
  listingId,
  listingTitle,
  availableQuantity,
  availableQuantityLabel,
  onClose,
  onSubmitted,
}: QuoteFormProps) {
  const [quantity, setQuantity] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const isSubmitting = state.status === "submitting";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Second guard: stops an Enter-key repeat while the request is in flight.
    if (isSubmitting) return;

    const parsedQuantity = Number(quantity.trim());
    if (!quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setState({
        status: "error",
        message: "Kuantitas harus lebih dari 0.",
      });
      return;
    }
    if (availableQuantity !== null && parsedQuantity > availableQuantity) {
      setState({
        status: "error",
        message: "Kuantitas melebihi jumlah yang tersedia.",
      });
      return;
    }

    const parsedPrice = Number(offerPrice.trim());
    if (!offerPrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setState({
        status: "error",
        message: "Harga penawaran harus lebih dari 0.",
      });
      return;
    }
    if (parsedPrice > MAX_OFFER_PRICE) {
      setState({
        status: "error",
        message: "Harga penawaran terlalu besar.",
      });
      return;
    }
    if (!fitsTwoDecimals(parsedPrice)) {
      setState({
        status: "error",
        message: "Harga penawaran mendukung maksimal 2 angka desimal.",
      });
      return;
    }

    const body = buildOfferBody({
      listingId,
      quantity: parsedQuantity,
      offerPrice: parsedPrice,
      paymentTerms,
      notes,
    });

    setState({ status: "submitting" });
    try {
      const response = await fetch(withBasePath(`/api/offer/${encodeURIComponent(token)}/quote`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.status === 201) {
        const data = (await response.json()) as {
          quoteRequest: { id: string; status: string; createdAt: string };
        };
        setState({
          status: "success",
          quoteRequestId: data.quoteRequest.id,
          summary: {
            listingId,
            listingTitle,
            quantity: parsedQuantity,
            offerPrice: parsedPrice,
            paymentTerms: body.paymentTerms,
            notes: body.notes,
          },
        });
        onSubmitted(data.quoteRequest.id);
        return;
      }

      const message =
        response.status === 401
          ? "Tautan akses ini sudah tidak berlaku. Muat ulang halaman dan minta tautan baru."
          : response.status === 400
            ? await readError(response)
            : "Terjadi kesalahan. Silakan coba lagi.";

      setState({ status: "error", message });
    } catch {
      setState({
        status: "error",
        message:
          "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.",
      });
    }
  }

  if (state.status === "success") {
    const { summary } = state;
    return (
      <div className="p-5 sm:p-6">
        <h2
          id="quote-form-title"
          className="text-base font-semibold text-slate-900 dark:text-slate-50"
        >
          Penawaran Terkirim
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Penawaran Anda berhasil dikirim.
        </p>

        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Batubara
            </dt>
            <dd className="max-w-[60%] text-right text-sm font-semibold text-slate-900 dark:text-slate-50">
              {summary.listingTitle}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Kuantitas
            </dt>
            <dd className="text-base font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              {formatNumber(summary.quantity, 3)} MT
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Harga Penawaran Anda
            </dt>
            <dd className="text-base font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              Rp {formatNumber(summary.offerPrice, 2)} / MT
            </dd>
          </div>
          {summary.paymentTerms ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Syarat Pembayaran
              </dt>
              <dd className="max-w-[60%] text-right text-sm font-medium text-slate-900 dark:text-slate-50">
                {summary.paymentTerms}
              </dd>
            </div>
          ) : null}
          {summary.notes ? (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Catatan
              </dt>
              <dd className="mt-1 text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {summary.notes}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-400">
          Penjual akan meninjau penawaran Anda dan menghubungi Anda untuk
          pembahasan lebih lanjut.
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          Belum ada kesepakatan transaksi.
        </p>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-5 sm:p-6"
      aria-busy={isSubmitting}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="quote-form-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-50"
          >
            Ajukan Penawaran
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
            {listingTitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Tutup"
          className="-mt-1 -mr-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <span aria-hidden="true" className="block text-lg leading-none">
            &times;
          </span>
        </button>
      </div>

      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        Tersedia:{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {availableQuantityLabel}
        </span>
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="quote-quantity"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Kuantitas (MT) <span className="text-red-600">*</span>
          </label>
          <input
            id="quote-quantity"
            name="quantity"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isSubmitting}
            placeholder={availableQuantity === null ? "" : String(availableQuantity)}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="quote-offer-price"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Harga Penawaran Anda (Rp / MT){" "}
            <span className="text-red-600">*</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
              Rp
            </span>
            <input
              id="quote-offer-price"
              name="offerPrice"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              required
              value={offerPrice}
              onChange={(event) => setOfferPrice(event.target.value)}
              disabled={isSubmitting}
              placeholder="650000"
              className={`${inputClass} pl-10`}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Harga yang Anda ajukan kepada penjual. Harga kesepakatan ditentukan
            bersama setelah negosiasi.
          </p>
        </div>

        <div>
          <label
            htmlFor="quote-payment-terms"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Syarat Pembayaran{" "}
            <span className="text-slate-400">(opsional)</span>
          </label>
          <input
            id="quote-payment-terms"
            name="paymentTerms"
            type="text"
            maxLength={MAX_PAYMENT_TERMS_LENGTH}
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.target.value)}
            disabled={isSubmitting}
            placeholder="mis. LC at sight, 30% di muka"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="quote-notes"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Catatan <span className="text-slate-400">(opsional)</span>
          </label>
          <textarea
            id="quote-notes"
            name="notes"
            rows={3}
            maxLength={MAX_NOTES_LENGTH}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isSubmitting}
            placeholder="Rentang waktu pengiriman, pelabuhan bongkar, kebutuhan sampling"
            className={`${inputClass} resize-y`}
          />
        </div>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {isSubmitting ? "Mengirim..." : "Kirim Penawaran"}
        </button>
      </div>
    </form>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.length > 0) return data.error;
  } catch {
    // fall through to the generic message
  }
  return "Permintaan tidak valid.";
}