"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingStatus } from "@/lib/quote-requests";

/**
 * Publish / unpublish / sold control for one listing.
 *
 * The buttons come from the transitions the server component computed against
 * lib/listing-status.ts, so the UI can only offer moves the API will accept.
 * There is no optimistic UI: nothing changes locally until the PATCH answers,
 * and a router refresh re-renders from the authoritative API response.
 */

const ACTION_LABEL: Partial<Record<ListingStatus, string>> = {
  PUBLISHED: "Terbitkan",
  DRAFT: "Kembalikan ke Draf",
  SOLD: "Tandai Terjual",
};

const ACTION_CLASS: Partial<Record<ListingStatus, string>> = {
  PUBLISHED:
    "border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:hover:bg-transparent dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950",
  DRAFT:
    "border-slate-300 text-slate-700 hover:bg-slate-50 disabled:hover:bg-transparent dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800",
  SOLD:
    "border-sky-300 text-sky-800 hover:bg-sky-50 disabled:hover:bg-transparent dark:border-sky-700 dark:text-sky-200 dark:hover:bg-sky-950",
};

type StatusControlProps = {
  listingId: string;
  currentStatus: ListingStatus;
  /** The allowed next states, derived from the transition table server-side. */
  allowed: readonly ListingStatus[];
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting"; statusTarget: ListingStatus }
  | { status: "error"; message: string };

export function ListingStatusControl({
  listingId,
  currentStatus,
  allowed,
}: StatusControlProps) {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function changeStatus(target: ListingStatus) {
    setState({ status: "submitting", statusTarget: target });
    const response = await fetch(
      `/api/admin/listings/${encodeURIComponent(listingId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      },
    );

    if (!response.ok) {
      let message = "Status listing tidak dapat diperbarui.";
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

    setState({ status: "idle" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allowed.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => changeStatus(target)}
            disabled={state.status === "submitting"}
            className={`rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 ${ACTION_CLASS[target] ?? ""}`}
          >
            {ACTION_LABEL[target] ?? target}
          </button>
        ))}
        {allowed.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {currentStatus === "SOLD"
              ? "Listing yang sudah terjual tidak dapat diubah."
              : "Tidak ada perubahan status lain yang tersedia."}
          </p>
        ) : null}
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {state.message}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Listing yang diterbitkan muncul di katalog pembeli bersama. Status Terjual
        menutup lot untuk catatan.
      </p>
    </div>
  );
}