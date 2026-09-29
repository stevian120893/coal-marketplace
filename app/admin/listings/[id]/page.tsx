import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fetchAdminApi } from "@/lib/server-api";
import { requireAdminPage } from "@/lib/admin/authorize";
import {
  coalCategoryDisplayLabel,
  coalTypeDisplayLabel,
  formatSpecificationValue,
  pricingModeDisplayLabel,
} from "@/lib/coal-specifications";
import { LISTING_STATUS_TRANSITIONS } from "@/lib/listing-status";
import type {
  AdminListingDetail,
  AdminListingDetailResponse,
} from "@/lib/quote-requests";
import { formatDateTime, formatMetric } from "../../quote-requests/format";
import { AdminNav } from "../../admin-nav";
import { AdminIdentityBar, DetailRow, SectionCard } from "../../quote-requests/ui";
import { ListingForm } from "../listing-form";
import { ListingStatusControl } from "../status-control";
import { ListingStatusBadge } from "../ui";

/**
 * Admin Listing detail: the full lot record, its status lifecycle, and the
 * edit form.
 *
 * The status control offers only the transitions lib/listing-status.ts allows
 * from the current state. The edit form replaces specifications and media
 * references wholesale. Buyer links are issued per buyer from the buyer
 * screen, not per listing - a listing is shared by all buyers, so no link
 * section lives here.
 */

export const metadata: Metadata = {
  title: "Batubara · Admin",
  description: "Detail dan pengelolaan listing batubara.",
};

type ListingDetailBody =
  | { status: "ok"; listing: AdminListingDetail }
  | { status: "not-found" }
  | { status: "error" };

async function ListingDetailPanel({ id }: { id: string }) {
  const listingResult = await fetchAdminApi<AdminListingDetailResponse>(
    `/api/admin/listings/${encodeURIComponent(id)}`,
  );

  let body: ListingDetailBody;
  if (!listingResult.ok) {
    body =
      listingResult.status === 404
        ? { status: "not-found" }
        : { status: "error" };
  } else {
    body = { status: "ok", listing: listingResult.data.listing };
  }

  if (body.status === "not-found") notFound();
  if (body.status === "error") {
    return (
      <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Batubara tidak dapat dimuat. Muat ulang halaman.
      </p>
    );
  }

  const { listing } = body;
  const isVisible = listing.status === "PUBLISHED" || listing.status === "SOLD";
  const allowed = LISTING_STATUS_TRANSITIONS[listing.status];

  return (
    <>
      <section className="mt-6">
        <SectionCard title="Batubara">
          <div className="flex items-center gap-2">
            {isVisible ? (
              <Link
                href={`/listings/${listing.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Lihat halaman publik
              </Link>
            ) : null}
            <ListingStatusBadge status={listing.status} />
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailRow
              label="Kategori"
              value={coalCategoryDisplayLabel(listing.category) ?? "—"}
            />
            <DetailRow
              label="Jenis Batubara"
              value={coalTypeDisplayLabel(listing.coalType, listing.typeLabel) ?? "—"}
            />
            <DetailRow label="Asal" value={listing.origin ?? "—"} />
            <DetailRow
              label="Kuantitas Tersedia"
              value={
                listing.quantity === null
                  ? "—"
                  : formatMetric(listing.quantity, "MT", {
                      maximumFractionDigits: 3,
                    })
              }
            />
            <DetailRow
              label="Mode Harga"
              value={pricingModeDisplayLabel(listing.pricingMode) ?? "—"}
            />
            <DetailRow label="Dibuat" value={formatDateTime(listing.createdAt)} />
            <DetailRow
              label="Diperbarui"
              value={formatDateTime(listing.updatedAt)}
            />
          </dl>
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="Spesifikasi Batubara">
          {listing.specifications.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum ada spesifikasi. Tambahkan melalui formulir di bawah.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listing.specifications.map((spec) => (
                <div
                  key={spec.name}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                >
                  <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    {spec.name}
                  </dt>
                  <dd className="mt-1 text-base font-semibold text-slate-900 tabular-nums dark:text-slate-50">
                    {formatSpecificationValue(spec.value, spec.unit)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="Referensi Media">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MediaList label="Foto" urls={listing.photos} />
            <MediaList label="Dokumen COA" urls={listing.coas} />
            <MediaList label="Video" urls={listing.videos} />
          </div>
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="Status">
          <ListingStatusControl
            listingId={listing.id}
            currentStatus={listing.status}
            allowed={allowed}
          />
        </SectionCard>
      </section>

      <section className="mt-6">
        <SectionCard title="Ubah Batubara">
          <ListingForm mode="edit" listingId={listing.id} initial={listing} />
        </SectionCard>
      </section>
    </>
  );
}

function MediaList({ label, urls }: { label: string; urls: string[] }) {
  if (urls.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {label}
        </p>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          Tidak ada
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label} ({urls.length})
      </p>
      <ul className="mt-1 space-y-1">
        {urls.map((url) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-xs font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListingDetailSkeleton() {
  return (
    <div
      className="mt-6 animate-pulse space-y-6"
      role="status"
      aria-label="Memuat listing batubara"
    >
      <div className="h-40 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" />
      <div className="h-40 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" />
      <div className="h-56 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}

export default async function AdminListingDetailPage(
  props: PageProps<"/admin/listings/[id]">,
) {
  const admin = await requireAdminPage();
  const { id } = await props.params;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
          Batubara
        </h1>
        <Link
          href="/admin/listings"
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          ← Semua batubara
        </Link>
      </div>
      <AdminNav active="listings" />
      <Suspense fallback={<ListingDetailSkeleton />}>
        <ListingDetailPanel id={id} />
      </Suspense>
      <AdminIdentityBar email={admin.email} />
    </main>
  );
}