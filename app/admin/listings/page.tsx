import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fetchAdminApi } from "@/lib/server-api";
import { requireAdminPage } from "@/lib/admin/authorize";
import type { AdminListingListResponse } from "@/lib/quote-requests";
import { AdminNav } from "../admin-nav";
import { AdminIdentityBar, EmptyState, ListSkeleton } from "../quote-requests/ui";
import { ListingRow } from "./ui";

/**
 * Admin list of coal listings: newest first, every row linking to its detail
 * screen for editing, publishing, and buyer-link generation.
 *
 * Data comes from /api/admin/listings so the screen renders exactly the
 * contract the API exposes. All statuses appear here (DRAFT included); only
 * PUBLISHED lots are visible to buyers in the shared catalog.
 */

export const metadata: Metadata = {
  title: "Batubara · Admin",
  description: "Kelola listing batubara marketplace.",
};

type ListingListBody =
  | { status: "ok"; data: AdminListingListResponse }
  | { status: "error" };

async function ListingList() {
  const result = await fetchAdminApi<AdminListingListResponse>("/api/admin/listings");

  const body: ListingListBody = result.ok
    ? { status: "ok", data: result.data }
    : { status: "error" };

  if (body.status === "error") {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Daftar batubara tidak dapat dimuat saat ini. Muat ulang halaman.
      </p>
    );
  }

  if (body.data.listings.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Belum ada batubara"
          body="Buat listing batubara pertama Anda. Listing baru dimulai sebagai draf dan diterbitkan saat sudah siap."
          action={
            <Link
              href="/admin/listings/new"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Tambah Batubara
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {body.data.total} listing batubara
        </p>
        <Link
          href="/admin/listings/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Tambah Batubara
        </Link>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {body.data.listings.map((listing) => (
          <ListingRow key={listing.id} listing={listing} />
        ))}
      </ul>
    </div>
  );
}

export default async function AdminListingsPage() {
  const admin = await requireAdminPage();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
        Daftar Batubara
      </h1>
      <AdminNav active="listings" />
      <Suspense fallback={<ListSkeleton />}>
        <ListingList />
      </Suspense>
      <AdminIdentityBar email={admin.email} />
    </main>
  );
}