import type { Metadata } from "next";
import Link from "next/link";

/**
 * Marketplace landing page.
 *
 * Buyers land here and go straight to the shared coal listing catalog. The
 * admin console stays reachable through its own entry point.
 */

export const metadata: Metadata = {
  title: "Marketplace Batubara",
  description:
    "Lihat batubara yang tersedia dan hubungi penjual untuk mengajukan penawaran.",
};

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        Marketplace Batubara
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-50">
        Lihat batubara yang tersedia
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        Lihat lot yang saat ini ditawarkan - spesifikasi, foto, dan dokumen COA.
        Harga dinegosiasikan langsung dengan penjual.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/listings"
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Lihat Listing
        </Link>
        <Link
          href="/admin/login"
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Konsol Admin
        </Link>
      </div>
    </main>
  );
}