import Link from "next/link";
import {
  coalCategoryDisplayLabel,
  coalTypeDisplayLabel,
} from "@/lib/coal-specifications";
import type { AdminListingListItem, ListingStatus } from "@/lib/quote-requests";
import { formatDate, formatMetric } from "../quote-requests/format";

/**
 * Presentational pieces for the admin Listing screens.
 *
 * Server components only. Listings are shared commercial lots (never buyer-
 * owned), so rows show lot facts, status, and asset counts only; pricing
 * records are private and live on their own screens.
 */

const STATUS_BADGE_CLASS: Record<ListingStatus, string> = {
  DRAFT: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  PUBLISHED:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  SOLD: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

/** DRAFT -> Draf, PUBLISHED -> Diterbitkan, SOLD -> Terjual. */
const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  DRAFT: "Draf",
  PUBLISHED: "Diterbitkan",
  SOLD: "Terjual",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[status]}`}
    >
      {LISTING_STATUS_LABELS[status]}
    </span>
  );
}

/** One row in the admin Listing list; the whole row links to the detail view. */
export function ListingRow({ listing }: { listing: AdminListingListItem }) {
  const categoryLabel = coalCategoryDisplayLabel(listing.category);
  const typeLabel = coalTypeDisplayLabel(listing.coalType, listing.typeLabel);

  return (
    <li>
      <Link
        href={`/admin/listings/${listing.id}`}
        className="block px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 sm:px-5 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60 dark:focus-visible:outline-slate-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
              {listing.title}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {categoryLabel ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {categoryLabel}
                </span>
              ) : null}
              {typeLabel ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {typeLabel}
                </span>
              ) : null}
            </div>
          </div>
          <ListingStatusBadge status={listing.status} />
        </div>

        <dl className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          {listing.origin ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-slate-500 dark:text-slate-400">Asal</dt>
              <dd className="text-slate-700 dark:text-slate-300">{listing.origin}</dd>
            </div>
          ) : null}
          {listing.quantity !== null ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-slate-500 dark:text-slate-400">Tersedia</dt>
              <dd className="font-semibold text-slate-900 tabular-nums dark:text-slate-50">
                {formatMetric(listing.quantity, "MT", { maximumFractionDigits: 3 })}
              </dd>
            </div>
          ) : null}
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Aset</dt>
            <dd className="text-slate-700 tabular-nums dark:text-slate-300">
              {listing.specificationCount} spesifikasi · {listing.photoCount} foto ·{" "}
              {listing.coaCount} COA · {listing.videoCount} video
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Dibuat</dt>
            <dd className="text-slate-700 tabular-nums dark:text-slate-300">
              {formatDate(listing.createdAt)}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}