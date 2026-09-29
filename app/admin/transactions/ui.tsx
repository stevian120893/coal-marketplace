import Link from "next/link";
import type {
  AdminTransactionListItem,
  TransactionStatus,
} from "@/lib/quote-requests";
import {
  formatDate,
  formatMetric,
  formatPrice,
  formatText,
  transactionStatusLabel,
} from "../quote-requests/format";

/**
 * Presentational pieces for the admin Transaction screens.
 *
 * The Transaction Row shows the final agreed price - the "Transaction Price" -
 * never the buyer's original Offer Price. Contact details (phone, email) are
 * intentionally absent from the list; they belong to the detail view.
 *
 * Server components only, mirroring the Buyer Offer list.
 */

const EM_DASH = "—";

/**
 * Full literal class strings per status. Tailwind only sees classes it can find
 * in the source, so these must never be assembled at runtime.
 */
const TRANSACTION_STATUS_BADGE_CLASS: Record<TransactionStatus, string> = {
  // PENDING exists on the enum but no row is ever created in it (creation
  // always writes CONFIRMED); the entry keeps the map exhaustive.
  PENDING:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  CONFIRMED:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  PROCESSING:
    "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  COMPLETED:
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CANCELLED: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TRANSACTION_STATUS_BADGE_CLASS[status]}`}
    >
      {transactionStatusLabel(status)}
    </span>
  );
}

/**
 * One row in the admin Transaction list. The whole row is the link to the
 * detail view, so the hit target is comfortable on a phone without a separate
 * control.
 */
export function TransactionRow({ transaction }: { transaction: AdminTransactionListItem }) {
  return (
    <li>
      <Link
        href={`/admin/transactions/${transaction.id}`}
        className="block px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 sm:px-5 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60 dark:focus-visible:outline-slate-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
              {formatText(transaction.buyer.companyName)}
            </p>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">
              {formatText(transaction.buyer.name)}
            </p>
          </div>
          <TransactionStatusBadge status={transaction.status} />
        </div>

        <p className="mt-2 truncate text-sm text-slate-600 dark:text-slate-400">
          {transaction.coalListing.title}
        </p>

        <dl className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Kuantitas</dt>
            <dd className="font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              {formatMetric(transaction.quantity, "MT", {
                maximumFractionDigits: 3,
              })}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">
              Harga Transaksi
            </dt>
            <dd className="font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              {formatPrice(transaction.price)}
              <span className="font-medium text-slate-500 dark:text-slate-400">
                {" "}
                / MT
              </span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">
              Syarat Pembayaran
            </dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {formatText(transaction.paymentTerms)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Dibuat</dt>
            <dd className="text-slate-700 tabular-nums dark:text-slate-300">
              {formatDate(transaction.createdAt)}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export { EM_DASH };