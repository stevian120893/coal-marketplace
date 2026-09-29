import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { apiBaseUrl } from "@/lib/api-url";
import {
  coalCategoryDisplayLabel,
  coalTypeDisplayLabel,
} from "@/lib/coal-specifications";
import type { PublicListingDetail } from "@/lib/listing-catalog";
import {
  ListingDetailBody,
  ListingHeaderChips,
} from "../listing-detail";

/**
 * Shared listing detail: the public face of one coal lot.
 *
 * The same presentation a buyer gets through a personalized link, served
 * without a token: specs, COA, photos, videos, and listing facts. DRAFT lots
 * are 404; SOLD lots stay visible with their Sold state.
 *
 * Making an offer still needs the buyer link - identity is resolved from the
 * AccessToken, never from an arbitrary userId - so the action section on this
 * shared page explains that instead of rendering the form.
 */

export const metadata: Metadata = {
  title: "Listing Batubara",
  description: "Detail lot batubara, spesifikasi, dan foto.",
};

type DetailState =
  | { status: "success"; listing: PublicListingDetail }
  | { status: "not-found" }
  | { status: "error" };

async function fetchListing(id: string): Promise<DetailState> {
  let response: Response;
  try {
    response = await fetch(
      `${await apiBaseUrl()}/api/listings/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
  } catch {
    return { status: "error" };
  }
  if (response.status === 404) return { status: "not-found" };
  if (!response.ok) return { status: "error" };
  try {
    const body = (await response.json()) as { listing: PublicListingDetail };
    return { status: "success", listing: body.listing };
  } catch {
    return { status: "error" };
  }
}

function DetailSkeleton() {
  return (
    <div
      className="animate-pulse"
      role="status"
      aria-label="Memuat listing batubara"
    >
      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-7 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-2 h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          />
        ))}
      </div>
      <div className="mt-6 h-12 rounded-lg bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

function SoldNotice() {
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      Lot ini sudah terjual dan ditampilkan sebagai referensi.
    </div>
  );
}

function OfferIdentityNotice() {
  return (
    <section aria-label="Ajukan penawaran" className="mt-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Ajukan Penawaran
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Penawaran dikirim melalui tautan pembeli pribadi Anda, yang
          mengidentifikasi perusahaan Anda kepada penjual. Silakan buka listing
          ini dengan tautan yang Anda terima untuk mengajukan penawaran.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Jika Anda belum memiliki tautan pembeli, hubungi penjual atau pemasok
          Anda untuk meminta tautan tersebut.
        </p>
      </div>
    </section>
  );
}

async function ListingPanel({ id }: { id: string }) {
  const state = await fetchListing(id);

  if (state.status === "not-found") {
    notFound();
  }

  if (state.status === "error") {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Listing ini tidak dapat dimuat. Muat ulang halaman atau coba lagi
        beberapa saat lagi.
      </p>
    );
  }

  const listing = state.listing;
  const isSold = listing.status === "SOLD";

  return (
    <div>
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Listing Bersama
          </p>
          <Link
            href="/listings"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Semua listing
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
            {listing.title}
          </h1>
          {isSold ? (
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              Terjual
            </span>
          ) : null}
        </div>
        <ListingHeaderChips
          categoryLabel={coalCategoryDisplayLabel(listing.category)}
          typeLabel={coalTypeDisplayLabel(listing.coalType, listing.typeLabel)}
        />
        {listing.description ? (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-400">
            {listing.description}
          </p>
        ) : null}
      </header>

      <ListingDetailBody listing={listing} />

      {isSold ? <SoldNotice /> : <OfferIdentityNotice />}

      <footer className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Harga dinegosiasikan langsung dengan penjual. Pemeriksaan fisik
          disarankan sebelum pembelian.
        </p>
      </footer>
    </div>
  );
}

export default async function ListingDetailPage(
  props: PageProps<"/listings/[id]">,
) {
  const { id } = await props.params;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<DetailSkeleton />}>
        <ListingPanel id={id} />
      </Suspense>
    </main>
  );
}