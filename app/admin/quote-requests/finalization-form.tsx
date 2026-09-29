"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Finalisasi Kesepakatan" form for a buyer offer under negotiation.
 *
 * The seller records the agreed commercial terms here: the final quantity
 * (defaulted from the buyer's offer, still editable), the final agreed price
 * (never the buyer's offer price), and the final payment terms. Submitting is
 * not "create a transaction" on an already-accepted offer - it is the single
 * action that finalizes the deal: the server creates the Transaction AND marks
 * the offer Disepakati in one atomic commit.
 *
 * There is no optimistic UI - nothing changes until the POST answers - and the
 * page re-reads from the server afterwards: on success the server replaces this
 * form with the Transaction card and the WhatsApp deep link.
 *
 * Client-side checks are convenience only; the server validates everything.
 */

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50";

export function FinalizationForm({
  offerId,
  defaultQuantity,
  defaultPaymentTerms,
  maxQuantityLabel,
}: {
  offerId: string;
  defaultQuantity: string;
  defaultPaymentTerms: string | null;
  /** "Kuantitas Tersedia" of the lot, for the ceiling hint under the field. */
  maxQuantityLabel: string;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [price, setPrice] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(defaultPaymentTerms ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const quantityNum = Number(quantity);
    const priceNum = Number(price);

    if (
      quantity.trim() === "" ||
      !Number.isFinite(quantityNum) ||
      quantityNum <= 0
    ) {
      setError("Kuantitas kesepakatan harus lebih dari 0.");
      return;
    }
    if (price.trim() === "" || !Number.isFinite(priceNum) || priceNum <= 0) {
      setError("Harga kesepakatan harus lebih dari 0.");
      return;
    }

    setSubmitting(true);
    setError(null);

    let response: Response;
    try {
      response = await fetch(
        `/api/admin/quote-requests/${encodeURIComponent(offerId)}/transaction`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            quantity: quantityNum,
            price: priceNum,
            paymentTerms:
              paymentTerms.trim() === "" ? null : paymentTerms.trim(),
          }),
        },
      );
    } catch {
      setError(
        "Tidak dapat menghubungi server. Kesepakatan belum difinalisasi.",
      );
      setSubmitting(false);
      return;
    }

    if (response.ok) {
      // Success: the server re-renders the page, replacing this form with the
      // Transaction card and the deal WhatsApp link. No client-side guess about
      // the created record is ever shown.
      setSubmitting(false);
      router.refresh();
    } else {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "Permintaan tidak valid.");
      setSubmitting(false);
      // Re-sync with the authoritative server state (e.g. a concurrent change).
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="final-quantity"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Kuantitas Kesepakatan (MT)
        </label>
        <input
          id="final-quantity"
          name="quantity"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
          className={`${inputClass} mt-1`}
          placeholder="2000"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Tidak boleh melebihi {maxQuantityLabel}.
        </p>
      </div>

      <div>
        <label
          htmlFor="final-price"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Harga Kesepakatan (Rp / MT)
        </label>
        <input
          id="final-price"
          name="price"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          required
          className={`${inputClass} mt-1`}
          placeholder="680000"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Harga yang disepakati bersama pembeli. Berbeda dari Harga Penawaran.
        </p>
      </div>

      <div>
        <label
          htmlFor="final-payment-terms"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Syarat Pembayaran
        </label>
        <input
          id="final-payment-terms"
          name="paymentTerms"
          type="text"
          autoComplete="off"
          value={paymentTerms}
          onChange={(event) => setPaymentTerms(event.target.value)}
          className={`${inputClass} mt-1`}
          placeholder="Cash"
        />
      </div>

      {error !== null && (
        <p
          role="alert"
          className="text-sm font-medium text-rose-700 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Memproses..." : "Finalisasi dan Buat Transaksi"}
      </button>
    </form>
  );
}
