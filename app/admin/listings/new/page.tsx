import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/authorize";
import { AdminNav } from "../../admin-nav";
import { AdminIdentityBar } from "../../quote-requests/ui";
import { ListingForm } from "../listing-form";

/**
 * Create a listing: basic information, flexible specifications, and media URL
 * references. New listings always start as drafts; publishing happens on the
 * listing screen once the lot is ready for the shared catalog.
 */

export const metadata: Metadata = {
  title: "Tambah Batubara · Admin",
  description: "Buat listing batubara.",
};

export default async function AdminNewListingPage() {
  const admin = await requireAdminPage();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
        Tambah Batubara
      </h1>
      <AdminNav active="listings" />
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <ListingForm mode="create" />
      </section>
      <AdminIdentityBar email={admin.email} />
    </main>
  );
}