import Link from "next/link";
import type { AdminBuyerListItem, UserStatus } from "@/lib/quote-requests";
import { formatDate, formatText } from "../quote-requests/format";

/**
 * Presentational pieces for the admin Buyer screens.
 *
 * Server components only. Buyers are User rows that are always role = BUYER;
 * these rows show identity, contact, status, and creation date - never offer
 * or transaction prices.
 */

const STATUS_BADGE_CLASS: Record<UserStatus, string> = {
  ACTIVE:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  INACTIVE:
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/** ACTIVE -> Aktif, INACTIVE -> Tidak Aktif. */
const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Tidak Aktif",
};

export function BuyerStatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[status]}`}
    >
      {USER_STATUS_LABELS[status]}
    </span>
  );
}

/** One row in the admin Buyer list; the whole row links to the detail view. */
export function BuyerRow({ buyer }: { buyer: AdminBuyerListItem }) {
  return (
    <li>
      <Link
        href={`/admin/buyers/${buyer.id}`}
        className="block px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 sm:px-5 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60 dark:focus-visible:outline-slate-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
              {formatText(buyer.companyName)}
            </p>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">
              {formatText(buyer.name)}
            </p>
          </div>
          <BuyerStatusBadge status={buyer.status} />
        </div>

        <dl className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Email</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {formatText(buyer.email)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">
              Nomor Telepon
            </dt>
            <dd className="text-slate-700 tabular-nums dark:text-slate-300">
              {formatText(buyer.phone)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Dibuat</dt>
            <dd className="text-slate-700 tabular-nums dark:text-slate-300">
              {formatDate(buyer.createdAt)}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}