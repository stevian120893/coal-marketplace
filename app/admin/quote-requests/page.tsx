import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fetchAdminApi } from "@/lib/server-api";
import { requireAdminPage } from "@/lib/admin/authorize";
import {
  isQuoteRequestStatus,
  QUOTE_REQUEST_STATUSES,
  type QuoteRequestListResponse,
  type QuoteRequestStatus,
} from "@/lib/quote-requests";
import { statusLabel } from "./format";
import { AdminNav } from "../admin-nav";
import {
  AdminIdentityBar,
  EmptyState,
  ListSkeleton,
  QuoteRequestRow,
} from "./ui";

/**
 * Admin list of buyer offers: newest first, filterable by status, with
 * a detail view per row where the status can be managed.
 *
 * Data comes from /api/admin/quote-requests so the screen renders exactly the
 * contract the API exposes. Filtering is done by the API through the
 * `?status=` query parameter, which keeps each filter link shareable and lets
 * the page render on the server with no client JavaScript. Status changes
 * happen on the detail page, not here.
 */

export const metadata: Metadata = {
  title: "Penawaran Pembeli · Admin",
  description: "Penawaran pembeli beserta pengelolaan statusnya.",
};

const LIST_PATH = "/admin/quote-requests";

/** `searchParams` values arrive as a string or an array of strings. */
function readStatusParam(
  value: string | string[] | undefined,
): QuoteRequestStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !isQuoteRequestStatus(raw)) return null;
  return raw;
}

function statusHref(status: QuoteRequestStatus | null): string {
  return status === null ? LIST_PATH : `${LIST_PATH}?status=${status}`;
}

function StatusFilter({ status }: { status: QuoteRequestStatus | null }) {
  return (
    <nav aria-label="Filter status" className="mt-6 flex flex-wrap gap-2">
      {[null, ...QUOTE_REQUEST_STATUSES].map((option) => {
        const isActive = option === status;
        return (
          <Link
            key={option ?? "all"}
            href={statusHref(option)}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                : "rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }
          >
            {option === null ? "Semua" : statusLabel(option)}
          </Link>
        );
      })}
    </nav>
  );
}

async function QuoteRequestList({
  status,
}: {
  status: QuoteRequestStatus | null;
}) {
  const query = status === null ? "" : `?status=${status}`;
  const result = await fetchAdminApi<QuoteRequestListResponse>(
    `${"/api/admin/quote-requests"}${query}`,
  );

  if (!result.ok) {
    return (
      <EmptyState
        title="Penawaran tidak dapat dimuat"
        body="Layanan admin tidak merespons. Muat ulang halaman untuk mencoba lagi."
      />
    );
  }

  const { quoteRequests, total, hasMore } = result.data;

  if (quoteRequests.length === 0) {
    return status === null ? (
      <EmptyState
        title="Belum ada penawaran"
        body="Penawaran yang dikirim pembeli dari halaman batubara akan muncul di sini."
      />
    ) : (
      <EmptyState
        title={`Tidak ada penawaran berstatus ${statusLabel(status)}`}
        body="Saat ini tidak ada penawaran dengan status ini."
        action={
          <Link
            href={LIST_PATH}
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Tampilkan semua penawaran
          </Link>
        }
      />
    );
  }

  const count = quoteRequests.length;

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {count} penawaran
        {status === null ? "" : ` dengan status ${statusLabel(status)}`}
        {hasMore ? `, terbaru ${count} dari ${total} yang cocok` : ""}
      </p>
      <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {quoteRequests.map((request) => (
          <QuoteRequestRow key={request.id} request={request} />
        ))}
      </ul>
    </div>
  );
}

export default async function QuoteRequestsPage(
  props: PageProps<"/admin/quote-requests">,
) {
  // Authorisation runs before the search params are read and before any child
  // is rendered, so an unauthenticated visitor is redirected without a single
  // quote-request row being fetched or sent to the browser.
  const admin = await requireAdminPage();

  const searchParams = await props.searchParams;
  // An unrecognised filter falls back to "Semua" here, so the screen always
  // renders; the API still rejects a bad status with 400.
  const status = readStatusParam(searchParams.status);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Admin
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
          Penawaran Pembeli
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Penawaran pembeli atas lot batubara, terbaru lebih dulu.
        </p>
      </header>

      <AdminNav active="offers" />

      <AdminIdentityBar email={admin.email} />

      <StatusFilter status={status} />

      <Suspense fallback={<ListSkeleton />}>
        <QuoteRequestList status={status} />
      </Suspense>
    </main>
  );
}
