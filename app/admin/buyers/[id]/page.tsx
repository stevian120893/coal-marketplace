import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fetchAdminApi } from "@/lib/server-api";
import { requireAdminPage } from "@/lib/admin/authorize";
import type {
  AdminBuyerDetailResponse,
  AdminBuyerProfile,
} from "@/lib/quote-requests";
import { formatDate, formatText } from "../../quote-requests/format";
import { AdminNav } from "../../admin-nav";
import { AdminIdentityBar, DetailRow, SectionCard } from "../../quote-requests/ui";
import { BuyerForm } from "../buyer-form";
import { BuyerLinkForm } from "../buyer-link-form";
import { BuyerStatusBadge } from "../ui";

/**
 * Admin Buyer detail: identity, status, private record counts, the buyer-wide
 * link generator, and the edit form. A generated link identifies this buyer
 * across every published listing - the buyer picks the listing on the offer
 * page, so there is no listing selector here.
 */

export const metadata: Metadata = {
  title: "Pembeli · Admin",
  description: "Profil dan pengelolaan pembeli.",
};

type BuyerDetailBody =
  | { status: "ok"; buyer: AdminBuyerProfile }
  | { status: "not-found" }
  | { status: "error" };

async function BuyerDetailPanel({ id }: { id: string }) {
  const result = await fetchAdminApi<AdminBuyerDetailResponse>(
    `/api/admin/buyers/${encodeURIComponent(id)}`,
  );

  let body: BuyerDetailBody;
  if (result.ok) {
    body = { status: "ok", buyer: result.data.buyer };
  } else if (result.status === 404) {
    body = { status: "not-found" };
  } else {
    body = { status: "error" };
  }

  if (body.status === "not-found") notFound();
  if (body.status === "error") {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Data pembeli tidak dapat dimuat. Muat ulang halaman.
      </p>
    );
  }

  const buyer = body.buyer;

  return (
    <>
      <section className="mt-6">
        <SectionCard title="Profil">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailRow
              label="Nama Perusahaan"
              value={formatText(buyer.companyName)}
            />
            <DetailRow label="Nama Kontak" value={formatText(buyer.name)} />
            <DetailRow label="Email" value={formatText(buyer.email)} />
            <DetailRow
              label="Nomor Telepon"
              value={formatText(buyer.phone)}
            />
            <DetailRow
              label="Status"
              value={
                <span className="inline-flex">
                  <BuyerStatusBadge status={buyer.status} />
                </span>
              }
            />
            <DetailRow label="Dibuat" value={formatDate(buyer.createdAt)} />
          </dl>
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="Aktivitas">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DetailRow
              label="Tautan Akses"
              value={String(buyer.accessLinkCount)}
            />
            <DetailRow
              label="Penawaran"
              value={String(buyer.offerCount)}
            />
            <DetailRow
              label="Transaksi"
              value={String(buyer.transactionCount)}
            />
          </dl>
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="Tautan Pembeli">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            Buat tautan pribadi untuk pembeli ini. Satu tautan mengenali mereka
            di seluruh batubara yang diterbitkan — pembeli membukanya lalu memilih
            batubara yang ingin dia jadikan dasar penawaran.
          </p>
          <BuyerLinkForm
            buyerId={buyer.id}
            buyerLabel={buyer.companyName ?? buyer.name ?? buyer.email ?? "pembeli"}
          />
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="Ubah Pembeli">
          <BuyerForm
            mode="edit"
            buyerId={buyer.id}
            initial={{
              companyName: buyer.companyName ?? "",
              name: buyer.name ?? "",
              phone: buyer.phone ?? "",
              email: buyer.email ?? "",
              status: buyer.status,
            }}
          />
        </SectionCard>
      </section>
    </>
  );
}

function BuyerDetailSkeleton() {
  return (
    <div
      className="mt-6 animate-pulse space-y-6"
      role="status"
      aria-label="Memuat data pembeli"
    >
      <div className="h-40 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" />
      <div className="h-52 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}

export default async function AdminBuyerDetailPage(
  props: PageProps<"/admin/buyers/[id]">,
) {
  const admin = await requireAdminPage();
  const { id } = await props.params;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
        Pembeli
      </h1>
      <AdminNav active="buyers" />
      <Suspense fallback={<BuyerDetailSkeleton />}>
        <BuyerDetailPanel id={id} />
      </Suspense>
      <AdminIdentityBar email={admin.email} />
    </main>
  );
}