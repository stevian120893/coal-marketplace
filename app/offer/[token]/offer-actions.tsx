"use client";

import { useRef, useState } from "react";
import { QuoteForm } from "./quote-form";

/**
 * The single action on the offer page: Ajukan Penawaran.
 *
 * COA, photos and videos are rendered as page sections (when they exist), so
 * this row only hosts the offer trigger. On success the form itself shows the
 * confirmation panel, and the CTA flips to "Offer submitted" to prevent
 * duplicate submissions.
 *
 * The token is passed in as a prop purely to build the request path. It is
 * never rendered, and it is already part of this URL, so nothing new is
 * exposed to the page.
 */
type OfferActionsProps = {
  token: string;
  listingId: string;
  availableQuantity: number | null;
  availableQuantityLabel: string;
  listingTitle: string;
};

export function OfferActions({
  token,
  listingId,
  availableQuantity,
  availableQuantityLabel,
  listingTitle,
}: OfferActionsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          dialogRef.current?.showModal();
        }}
        disabled={submittedId !== null}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg bg-slate-900 px-4 py-3 text-left hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:flex-1 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        <span>
          <span className="block text-sm font-semibold text-white dark:text-slate-900">
            {submittedId !== null ? "Penawaran Terkirim" : "Ajukan Penawaran"}
          </span>
          <span
            id="hint-request-quote"
            className="block text-xs text-slate-300 dark:text-slate-600"
          >
            {submittedId !== null
              ? "Menunggu tanggapan penjual"
              : "Kirim penawaran Anda untuk lot ini"}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-slate-600 px-2 py-0.5 text-[11px] font-medium tracking-wide text-slate-200 uppercase dark:border-slate-300 dark:text-slate-700">
          {submittedId !== null ? "Terkirim" : "Tersedia"}
        </span>
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        aria-labelledby="quote-form-title"
        className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 backdrop:bg-slate-900/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
      >
        {isOpen ? (
          <QuoteForm
            token={token}
            listingId={listingId}
            listingTitle={listingTitle}
            availableQuantity={availableQuantity}
            availableQuantityLabel={availableQuantityLabel}
            onClose={() => {
              dialogRef.current?.close();
            }}
            onSubmitted={(id) => {
              // The form stays open to show its confirmation panel; the CTA
              // behind the dialog is disabled once an offer is recorded.
              setSubmittedId(id);
            }}
          />
        ) : null}
      </dialog>
    </>
  );
}