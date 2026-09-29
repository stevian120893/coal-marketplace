import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fetchAdminApi } from "@/lib/server-api";
import { requireAdminPage } from "@/lib/admin/authorize";
import type { AdminBuyerListResponse } from "@/lib/quote-requests";
import { AdminNav } from "../admin-nav";
import { AdminIdentityBar, EmptyState, ListSkeleton } from "../quote-requests/ui";
import { BuyerRow } from "./ui";

/**
 * Admin list of buyers: newest first, each row linking to its detail screen
 * where the buyer can be edited. Buyers are User rows with role BUYER.
 *
 * Data comes from /api/admin/buyers so the screen renders exactly the contract
 * the API exposes. Buyer creation happens on /admin/buyers/new.
 */

export const metadata: Metadata = {
  title: "Pembeli · Admin",
  description: "Kelola pembeli marketplace.",
};

type BuyerListBody =
  | { status: "ok"; data: AdminBuyerListResponse }
  | { status: "error" };

async function BuyerList() {
  const result = await fetchAdminApi<AdminBuyerListResponse>("/api/admin/buyers");

  const body: BuyerListBody = result.ok
    ? { status: "ok", data: result.data }
    : { status: "error" };

  if (body.status === "error") {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Daftar pembeli tidak dapat dimuat saat ini. Muat ulang halaman.
      </p>
    );
  }

  if (body.data.buyers.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Belum ada pembeli"
          body="Tambahkan pembeli pertama Anda agar dapat diberi tautan akses ke katalog batubara."
          action={
            <Link
              href="/admin/buyers/new"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Tambah Pembeli
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
          {body.data.total} pembeli
        </p>
        <Link
          href="/admin/buyers/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Tambah Pembeli
        </Link>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {body.data.buyers.map((buyer) => (
          <BuyerRow key={buyer.id} buyer={buyer} />
        ))}
      </ul>
    </div>
  );
}

export default async function AdminBuyersPage() {
  const admin = await requireAdminPage();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
        Pembeli
      </h1>
      <AdminNav active="buyers" />
      <Suspense fallback={<ListSkeleton />}>
        <BuyerList />
      </Suspense>
      <AdminIdentityBar email={admin.email} />
    </main>
  );
}