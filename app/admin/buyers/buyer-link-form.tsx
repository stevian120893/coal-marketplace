"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * Generate Buyer Link (buyer-wide).
 *
 * One link identifies this buyer across every published listing: the buyer
 * opens /offer/<buyer-slug>-<secret> and chooses which listing to make an
 * offer on, so no listing selector exists here. The server mints a fresh link,
 * returns it exactly once (Copy / Open), and stores only the SHA-256 hash of
 * the secret. The raw secret never appears again after this screen; existing
 * valid links are never silently invalidated, so generating another link keeps
 * earlier ones working.
 */

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "done"; url: string; expiresAt: string }
  | { status: "error"; message: string };

type BuyerLinkFormProps = {
  buyerId: string;
  buyerLabel: string;
};

export function BuyerLinkForm({ buyerId, buyerLabel }: BuyerLinkFormProps) {
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function generate() {
    setState({ status: "submitting" });

    try {
      const response = await fetch(withBasePath("/api/admin/access-links"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: buyerId }),
      });

      if (!response.ok) {
        let message = "Tautan pembeli tidak dapat dibuat.";
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

      const body = (await response.json()) as {
        accessLink: { url: string; expiresAt: string };
      };
      setState({
        status: "done",
        url: body.accessLink.url,
        expiresAt: body.accessLink.expiresAt,
      });
    } catch {
      setState({
        status: "error",
        message: "Tidak dapat menghubungi server. Silakan coba lagi.",
      });
    }
  }

  async function copyLink() {
    if (state.status !== "done") return;
    try {
      await navigator.clipboard.writeText(state.url);
    } catch {
      // Clipboard can be unavailable (e.g. http on a non-localhost host);
      // the Open control still works, and the URL is selectable.
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={generate}
        disabled={state.status === "submitting"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {state.status === "submitting"
          ? "Membuat..."
          : "Tampilkan Tautan Pembeli"}
      </button>

      {state.status === "done" ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
            Tautan Pembeli
          </p>
          <p className="mt-0.5 text-xs text-emerald-900/80 dark:text-emerald-200/80">
            Untuk {buyerLabel} — membuka katalog bersama agar pembeli dapat
            memilih batubara yang diminati.
          </p>
          <p className="mt-1 break-all font-mono text-xs text-emerald-900 dark:text-emerald-100">
            {state.url}
          </p>
          <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-200/80">
            Berlaku hingga {new Date(state.expiresAt).toLocaleDateString("id-ID")}.
            Bagikan tautan ini kepada pembeli — tautan hanya ditampilkan satu
            kali ini.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-950 dark:text-emerald-200 dark:hover:bg-emerald-950"
            >
              Salin Tautan
            </button>
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              Buka
            </a>
          </div>
        </div>
      ) : null}

      {state.status === "error" ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}