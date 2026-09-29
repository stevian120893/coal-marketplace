import type { Metadata } from "next";
import { Suspense } from "react";
import { apiBaseUrl } from "@/lib/api-url";
import type { BuyerDealsResponse } from "@/lib/buyer-deals";
import {
  formatDateTime,
  formatMetric,
  formatPrice,
  statusLabel,
  transactionStatusLabel,
} from "@/app/admin/quote-requests/format";
import { BuyerCatalog, type BuyerListing } from "./buyer-catalog";

/**
 * Personalized buyer page behind the magic link.
 *
 * The link identifies the BUYER, not a listing: the buyer opens it once and
 * browses every published (or sold) listing in the shared catalog, picking a
 * coal type from the selector that stays visible at the top and making an
 * offer on the detail shown below. There is no navigation to a separate
 * listings page - this page IS the buyer's catalog.
 *
 * The URL carries the raw secret in either format - legacy /offer/<raw-token>
 * or buyer-wide /offer/<slug>-<secret> - and only its SHA-256 hash is ever
 * stored or compared (lib/offer-auth). Listings are rendered through the same
 * presentation the public catalog uses, so each lot looks identical whether it
 * is reached via the personalized link or the shared catalog.
 *
 * On top of the shared lot sections the page is personalised: the greeting,
 * the Make an Offer form (posted to the quote endpoint, which derives the
 * buyer from the token and validates the buyer's chosen listing), and a
 * "Your offers and deal" panel scoped to this buyer across every listing.
 * No price is ever shown beyond the buyer's own offer and deal.
 */

export const metadata: Metadata = {
  title: "Penawaran Batubara",
  description: "Pilih jenis batubara dan kirim penawaran Anda.",
};

const EM_DASH = "—";

type OfferBuyer = {
  companyName: string | null;
  name: string | null;
};

type OfferResponse = {
  buyer: OfferBuyer;
  listings: BuyerListing[];
};

type OfferState =
  | { status: "success"; offer: OfferResponse }
  | { status: "invalid" }
  | { status: "error" };

async function fetchOffer(token: string): Promise<OfferState> {
  let response: Response;
  try {
    response = await fetch(
      `${await apiBaseUrl()}/api/offer/${encodeURIComponent(token)}`,
      // Token-gated data: never serve it from any cache.
      { cache: "no-store" },
    );
  } catch {
    return { status: "error" };
  }

  if (response.status === 401) return { status: "invalid" };
  if (!response.ok) return { status: "error" };

  try {
    return { status: "success", offer: (await response.json()) as OfferResponse };
  } catch {
    return { status: "error" };
  }
}

type DealsState =
  | { status: "success"; deals: BuyerDealsResponse }
  | { status: "error" };

async function fetchDeals(token: string): Promise<DealsState> {
  let response: Response;
  try {
    response = await fetch(
      `${await apiBaseUrl()}/api/offer/${encodeURIComponent(token)}/deals`,
      { cache: "no-store" },
    );
  } catch {
    return { status: "error" };
  }
  if (!response.ok) return { status: "error" };
  try {
    return { status: "success", deals: (await response.json()) as BuyerDealsResponse };
  } catch {
    return { status: "error" };
  }
}

function OfferSkeleton() {
  return (
    <div
      className="animate-pulse"
      role="status"
      aria-label="Memuat penawaran"
    >
      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-7 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-2 h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
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

function NoticeCard({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{body}</p>
      </div>
    </div>
  );
}

/**
 * The buyer's own offer history and final deal across every shared listing,
 * shown only to the token's buyer (the endpoint scopes rows by the token's
 * user). Each offer row names the listing it was made on, since a buyer-wide
 * link can carry offers on several lots.
 */
async function DealStatusPanel({ token }: { token: string }) {
  const state = await fetchDeals(token);
  if (state.status === "error") return null;

  const { offers, transaction } = state.deals;
  if (offers.length === 0 && transaction === null) return null;

  return (
    <section aria-label="Penawaran dan kesepakatan Anda" className="mt-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Penawaran dan Kesepakatan Anda
        </h2>

        {transaction !== null ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:grid-cols-4 dark:border-emerald-900 dark:bg-emerald-950">
            <div>
              <dt className="text-xs font-medium tracking-wide text-emerald-900 uppercase dark:text-emerald-200">
                Status Kesepakatan
              </dt>
              <dd className="mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-100">
                {transactionStatusLabel(transaction.status)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-emerald-900 uppercase dark:text-emerald-200">
                Harga Transaksi
              </dt>
              <dd className="mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-100">
                {formatPrice(transaction.price)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-emerald-900 uppercase dark:text-emerald-200">
                Kuantitas
              </dt>
              <dd className="mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-100">
                {formatMetric(transaction.quantity, "MT")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-emerald-900 uppercase dark:text-emerald-200">
                Syarat Pembayaran
              </dt>
              <dd className="mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-100">
                {transaction.paymentTerms ?? EM_DASH}
              </dd>
            </div>
          </dl>
        ) : null}

        {offers.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {offers.map((offer) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 text-sm"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-50">
                    {statusLabel(offer.status)}
                  </span>
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    {formatDateTime(offer.createdAt)}
                  </span>
                  {offer.listingTitle ? (
                    <span className="ml-2 text-slate-500 dark:text-slate-400">
                      {offer.listingTitle}
                    </span>
                  ) : null}
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  {formatMetric(offer.quantity, "MT")}
                  <span className="mx-2">·</span>
                  <span className="font-medium text-slate-900 dark:text-slate-50">
                    {formatPrice(offer.offerPrice)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Penawaran Anda bersifat privat untuk perusahaan Anda. Negosiasi
          dilakukan langsung dengan penjual; setelah disepakati, kesepakatan
          final akan tampil di sini.
        </p>
      </div>
    </section>
  );
}

async function OfferPanel({ token }: { token: string }) {
  const state = await fetchOffer(token);

  if (state.status === "invalid") {
    return (
      <NoticeCard
        heading="Tautan ini sudah tidak berlaku"
        body="Tautan akses sudah kedaluwarsa atau dicabut. Silakan minta tautan baru kepada pemasok batubara Anda."
      />
    );
  }

  if (state.status === "error") {
    return (
      <NoticeCard
        heading="Penawaran tidak dapat dimuat"
        body="Terjadi kendala pada sisi kami. Silakan muat ulang halaman atau coba lagi beberapa saat lagi."
      />
    );
  }

  const { buyer, listings } = state.offer;
  return (
    <div>
      <BuyerCatalog token={token} buyer={buyer} listings={listings} />
      <DealStatusPanel token={token} />
    </div>
  );
}

export default async function OfferPage(props: PageProps<"/offer/[token]">) {
  const { token } = await props.params;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<OfferSkeleton />}>
        <OfferPanel token={token} />
      </Suspense>
    </main>
  );
}