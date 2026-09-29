import Link from "next/link";
import type { ReactNode } from "react";
import type {
  QuoteRequestListItem,
  QuoteRequestStatus,
} from "@/lib/quote-requests";
import { LogoutButton } from "./logout-button";
import { formatDate, formatMetric, formatPrice, formatText, statusLabel } from "./format";

/**
 * Small presentational pieces shared by the admin list and detail screens.
 *
 * Server components only: the admin area is entirely read-only, so nothing
 * here needs client JavaScript.
 */

const EM_DASH = "—";

/**
 * Full literal class strings per status. Tailwind only sees classes it can find
 * in the source, so these must never be assembled at runtime.
 */
const STATUS_BADGE_CLASS: Record<QuoteRequestStatus, string> = {
  PENDING:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  IN_NEGOTIATION:
    "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  ACCEPTED:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  REJECTED: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  CANCELLED:
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: QuoteRequestStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

/**
 * Identifies the signed-in admin and offers sign-out. Replaces the earlier
 * "authentication is not implemented" notice, which is no longer true.
 */
export function AdminIdentityBar({ email }: { email: string | null }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="min-w-0 truncate text-sm text-slate-600 dark:text-slate-400">
        Masuk sebagai{" "}
        <span className="font-medium text-slate-900 dark:text-slate-50">
          {email ?? "admin"}
        </span>
      </p>
      <LogoutButton />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        {title}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Label/value pair for the detail sections. */
export function DetailRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium break-words text-slate-900 dark:text-slate-50">
        {value}
      </dd>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * One row in the admin list. The whole row is the link to the detail view, so
 * the hit target is comfortable on a phone without a separate control.
 */
export function QuoteRequestRow({ request }: { request: QuoteRequestListItem }) {
  return (
    <li>
      <Link
        href={`/admin/quote-requests/${request.id}`}
        className="block px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 sm:px-5 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60 dark:focus-visible:outline-slate-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
              {formatText(request.buyer.companyName)}
            </p>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">
              {formatText(request.buyer.name)}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <p className="mt-2 truncate text-sm text-slate-600 dark:text-slate-400">
          {request.coalListing.title}
        </p>

        <dl className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Kuantitas</dt>
            <dd className="font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              {formatMetric(request.quantity, "MT", {
                maximumFractionDigits: 3,
              })}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">
              Harga Penawaran
            </dt>
            <dd className="font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              {formatPrice(request.offerPrice)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">
              Syarat Pembayaran
            </dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {formatText(request.paymentTerms)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Dibuat</dt>
            <dd className="text-slate-700 tabular-nums dark:text-slate-300">
              {formatDate(request.createdAt)}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export function ListSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3"
      role="status"
      aria-label="Memuat penawaran pembeli"
    >
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-3 h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export { EM_DASH };
