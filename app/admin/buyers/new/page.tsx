import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/authorize";
import { AdminNav } from "../../admin-nav";
import { AdminIdentityBar } from "../../quote-requests/ui";
import { BuyerForm } from "../buyer-form";

/**
 * Create a buyer: the minimal identity form. Buyers are always role = BUYER;
 * this screen has no role selector and the API rejects any attempt to create
 * an ADMIN through it.
 */

export const metadata: Metadata = {
  title: "Tambah Pembeli · Admin",
  description: "Tambahkan pembeli baru untuk marketplace.",
};

export default async function AdminNewBuyerPage() {
  const admin = await requireAdminPage();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
        Tambah Pembeli
      </h1>
      <AdminNav active="buyers" />
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <BuyerForm mode="create" />
      </section>
      <AdminIdentityBar email={admin.email} />
    </main>
  );
}