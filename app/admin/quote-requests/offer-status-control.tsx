"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuoteRequestStatus } from "@/lib/quote-requests";
import { withBasePath } from "@/lib/base-path";
import { statusLabel } from "./format";
import { StatusBadge } from "./ui";

/**
 * Status control for a single buyer offer.
 *
 * The buttons come from the *allowed next states* the server component computed
 * against the transition table, so the UI can only offer transitions the API
 * will accept. There is no optimistic UI: nothing changes locally until the
 * PATCH answers, and a server refresh re-renders the page from the authoritative
 * API response (success or failure alike). The server response decides.
 *
 * ACCEPTED (Disepakati) is deliberately absent from ACTION_LABEL: an offer only
 * reaches that status through "Finalisasi Kesepakatan", which creates the final
 * Transaction in the same commit. It is not a transition this control may apply.
 */

const ACTION_LABEL: Partial<Record<QuoteRequestStatus, string>> = {
  IN_NEGOTIATION: "Mulai Negosiasi",
  REJECTED: "Tolak",
  CANCELLED: "Batalkan",
};

/** Full literal Tailwind class strings so every one is visible to the scanner. */
const ACTION_CLASS: Partial<Record<QuoteRequestStatus, string>> = {
  IN_NEGOTIATION:
    "border-sky-300 text-sky-800 hover:bg-sky-50 disabled:hover:bg-transparent dark:border-sky-700 dark:text-sky-200 dark:hover:bg-sky-950",
  REJECTED:
    "border-rose-300 text-rose-800 hover:bg-rose-50 disabled:hover:bg-transparent dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-950",
  CANCELLED:
    "border-slate-300 text-slate-700 hover:bg-slate-50 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
};

export function OfferStatusControl({
  offerId,
  currentStatus,
  allowedStatuses,
}: {
  offerId: string;
  currentStatus: QuoteRequestStatus;
  allowedStatuses: readonly QuoteRequestStatus[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<QuoteRequestStatus | null>(null);
  const [notice, setNotice] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);

  async function applyStatus(next: QuoteRequestStatus) {
    if (pending !== null) return;
    setPending(next);
    setNotice(null);
    const label = statusLabel(next);

    let response: Response;
    try {
      response = await fetch(
        withBasePath(`/api/admin/quote-requests/${encodeURIComponent(offerId)}`),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: next }),
        },
      );
    } catch {
      setNotice({
        kind: "error",
        text: "Tidak dapat menghubungi server. Status penawaran tidak diubah.",
      });
      setPending(null);
      router.refresh();
      return;
    }

    if (response.ok) {
      setNotice({
        kind: "success",
        text: `Status penawaran berhasil diubah menjadi ${label}.`,
      });
    } else {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setNotice({
        kind: "error",
        text: body?.error ?? "Permintaan tidak valid.",
      });
    }
    setPending(null);

    // Re-sync with the server either way: the displayed status and timestamps
    // always reflect what the API now holds, never a client-side guess.
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Status Penawaran
        </h3>
        <StatusBadge status={currentStatus} />
      </div>

      {allowedStatuses.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {allowedStatuses.map((next) => (
            <button
              key={next}
              type="button"
              disabled={pending !== null}
              onClick={() => applyStatus(next)}
              className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${ACTION_CLASS[next] ?? ""}`}
            >
              {pending === next ? "Menyimpan..." : ACTION_LABEL[next]}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Penawaran ini sudah ditutup dan tidak dapat diubah lagi.
        </p>
      )}

      <p
        role="status"
        aria-live="polite"
        className={
          notice === null
            ? "hidden"
            : notice.kind === "success"
              ? "mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
              : "mt-3 text-sm font-medium text-rose-700 dark:text-rose-300"
        }
      >
        {notice?.text}
      </p>
    </div>
  );
}