"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TransactionStatus } from "@/lib/quote-requests";
import { withBasePath } from "@/lib/base-path";
import { TransactionStatusBadge } from "./ui";
import { transactionStatusLabel } from "../quote-requests/format";

/**
 * Status control for a single Transaction.
 *
 * The buttons come from the *allowed next states* the server component
 * computed against the transition table, so the UI can only offer transitions
 * the API will accept. There is no optimistic UI: nothing changes locally until
 * the PATCH answers, and a server refresh re-renders the page from the
 * authoritative API response (success or failure alike). The server response
 * decides.
 */

const ACTION_LABEL: Partial<Record<TransactionStatus, string>> = {
  PROCESSING: "Mulai Diproses",
  COMPLETED: "Tandai Selesai",
  CANCELLED: "Batalkan Transaksi",
};

/** Full literal Tailwind class strings so every one is visible to the scanner. */
const ACTION_CLASS: Partial<Record<TransactionStatus, string>> = {
  PROCESSING:
    "border-sky-300 text-sky-800 hover:bg-sky-50 disabled:hover:bg-transparent dark:border-sky-700 dark:text-sky-200 dark:hover:bg-sky-950",
  COMPLETED:
    "border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:hover:bg-transparent dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950",
  CANCELLED:
    "border-rose-300 text-rose-800 hover:bg-rose-50 disabled:hover:bg-transparent dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-950",
};

const TERMINAL_MESSAGE: Partial<Record<TransactionStatus, string>> = {
  COMPLETED: "Transaksi selesai.",
  CANCELLED: "Transaksi dibatalkan.",
};

export function TransactionStatusControl({
  transactionId,
  currentStatus,
  allowedStatuses,
}: {
  transactionId: string;
  currentStatus: TransactionStatus;
  allowedStatuses: readonly TransactionStatus[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<TransactionStatus | null>(null);
  const [notice, setNotice] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);

  async function applyStatus(next: TransactionStatus) {
    if (pending !== null) return;
    setPending(next);
    setNotice(null);
    const label = transactionStatusLabel(next);

    let response: Response;
    try {
      response = await fetch(
        withBasePath(`/api/admin/transactions/${encodeURIComponent(transactionId)}`),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: next }),
        },
      );
    } catch {
      setNotice({
        kind: "error",
        text: "Tidak dapat menghubungi server. Status transaksi tidak diubah.",
      });
      setPending(null);
      router.refresh();
      return;
    }

    if (response.ok) {
      setNotice({
        kind: "success",
        text: `Status transaksi berhasil diubah menjadi ${label}.`,
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

  const terminalMessage = TERMINAL_MESSAGE[currentStatus];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Status Transaksi
        </h3>
        <TransactionStatusBadge status={currentStatus} />
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
        <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          {terminalMessage ??
            "Transaksi ini sudah ditutup dan tidak dapat diubah lagi."}
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