import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { apiBaseUrl } from "@/lib/api-url";
import {
  coalCategoryDisplayLabel,
  coalTypeDisplayLabel,
  pricingModeDisplayLabel,
  formatSpecificationValue,
} from "@/lib/coal-specifications";
import type {
  PublicListingListResponse,
  PublicListingSummary,
} from "@/lib/listing-catalog";

/**
 * Shared buyer listing catalog.
 *
 * A public, no-login list of every published coal lot. Coal Listings are
 * shared commercial listings - the same lot is visible to all buyers, so there
 * is no "choose a buyer" here and no token requirement. Only PUBLISHED (and
 * SOLD, for the record) lots appear; every card links to the shared detail
 * page, which reuses the personalised offer-page presentation.
 *
 * Data comes from GET /api/listings so the page renders exactly the public
 * contract: listing-level facts only, never a Buyer Offer or Transaction price.
 */

export const metadata: Metadata = {
  title: "Listing Batubara",
  description: "Lihat lot batubara yang saat ini ditawarkan.",
};

type CatalogState =
  | { status: "success"; data: PublicListingListResponse }
  | { status: "error" };

async function fetchCatalog(): Promise<CatalogState> {
  let response: Response;
  try {
    response = await fetch(`${await apiBaseUrl()}/api/listings`, {
      cache: "no-store",
    });
  } catch {
    return { status: "error" };
  }
  if (!response.ok) return { status: "error" };
  try {
    return { status: "success", data: (await response.json()) as PublicListingListResponse };
  } catch {
    return { status: "error" };
  }
}

function CatalogCard({ listing }: { listing: PublicListingSummary }) {
  const isSold = listing.status === "SOLD";
  const quantity = formatSpecificationValue(listing.quantity ?? "", "MT");
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          {listing.title}
        </h2>
        {isSold ? (
          <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            Terjual
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {coalCategoryDisplayLabel(listing.category) ? (
          <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            {coalCategoryDisplayLabel(listing.category)}
          </span>
        ) : null}
        {coalTypeDisplayLabel(listing.coalType, listing.typeLabel) ? (
          <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-400">
            {coalTypeDisplayLabel(listing.coalType, listing.typeLabel)}
          </span>
        ) : null}
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {listing.origin ? (
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              Asal
            </dt>
            <dd className="font-medium text-slate-900 dark:text-slate-50">
              {listing.origin}
            </dd>
          </div>
        ) : null}
        {listing.quantity !== null ? (
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              Tersedia
            </dt>
            <dd className="font-medium text-slate-900 dark:text-slate-50">
              {quantity}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Harga</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-50">
            {pricingModeDisplayLabel(listing.pricingMode)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

async function CatalogList() {
  const state = await fetchCatalog();

  if (state.status === "error") {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Daftar listing tidak dapat dimuat saat ini. Muat ulang halaman atau coba
        lagi beberapa saat lagi.
      </p>
    );
  }

  if (state.data.listings.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Saat ini belum ada listing yang tersedia. Silakan kembali lagi nanti.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {state.data.listings.map((listing) => (
        <CatalogCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div
      className="mt-6 grid animate-pulse gap-4 sm:grid-cols-2"
      role="status"
      aria-label="Memuat listing batubara"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="h-44 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        />
      ))}
    </div>
  );
}

export default function ListingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Marketplace Batubara
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
          Listing Batubara
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Seluruh lot batubara yang saat ini tersedia. Harga dinegosiasikan
          langsung dengan penjual; buka sebuah lot untuk melihat spesifikasi dan
          fotonya.
        </p>
      </header>
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogList />
      </Suspense>
    </main>
  );
}