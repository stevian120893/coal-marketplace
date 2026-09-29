import type { ReactNode } from "react";
import { PhotoGallery } from "@/app/listings/photo-gallery";
import {
  formatSpecificationValue,
  pricingModeDisplayLabel,
} from "@/lib/coal-specifications";

/**
 * Shared presentation for one coal lot.
 *
 * Both the token-gated offer page (/offer/[token]) and the shared catalog
 * detail page (/listings/[id]) render the same lot sections - facts, notices,
 * photos, COA, videos, specifications - from a listing-shaped object, so the
 * buyer sees one consistent layout no matter which door they walked through.
 *
 * Server components only; the only client island is the photo gallery.
 */

export type SharedListingBody = {
  title: string;
  description: string | null;
  category: string | null;
  origin: string | null;
  /** Decimal serialised as a string so no precision is lost in JSON. */
  quantity: string | null;
  pricingMode: string | null;
  specifications: { name: string; value: string; unit: string | null }[];
  photos: string[];
  coas: string[];
  videos: string[];
};

export function SpecCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900 tabular-nums sm:text-xl dark:text-slate-50">
        {value}
      </dd>
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold text-slate-900 sm:text-lg dark:text-slate-50">
        {value}
      </dd>
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
      {children}
    </h2>
  );
}

export function InspectionNotice() {
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      Pemeriksaan fisik disarankan sebelum pembelian. Informasi COA dan data
      pada listing digunakan sebagai referensi dan tidak menggantikan pemeriksaan
      fisik.
    </div>
  );
}

export function LowNoSpecNotice() {
  return (
    <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-semibold">LOW / NO SPEC</p>
      <p className="mt-1">
        Lot ini ditawarkan apa adanya tanpa jaminan spesifikasi bergrading.
        Kualitas dapat berbeda pada setiap kapal, sehingga pemeriksaan fisik
        disarankan sebelum pembelian.
      </p>
    </div>
  );
}

export function CoaSection({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <section aria-label="Sertifikat analisa" className="mt-6">
      <SectionHeading>COA</SectionHeading>
      <div className="mt-3 flex flex-wrap gap-3">
        {urls.map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Lihat COA
          </a>
        ))}
      </div>
    </section>
  );
}

export function VideoSection({ urls, title }: { urls: string[]; title: string }) {
  if (urls.length === 0) return null;
  return (
    <section aria-label="Video" className="mt-6">
      <SectionHeading>Video</SectionHeading>
      <div className="mt-3 space-y-4">
        {urls.map((url, i) => (
          <video
            key={url}
            controls
            preload="metadata"
            playsInline
            aria-label={`${title} — video ${i + 1}`}
            className="w-full rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800"
          >
            <source src={url} />
            Browser Anda tidak dapat memutar video ini.
          </video>
        ))}
      </div>
    </section>
  );
}

/**
 * Category and coal type chips used under the lot title on both pages.
 * `categoryLabel` / `typeLabel` are pre-formatted to keep this presentational.
 */
export function ListingHeaderChips({
  categoryLabel,
  typeLabel,
}: {
  categoryLabel: string | null;
  typeLabel: string | null;
}) {
  if (!categoryLabel && !typeLabel) return null;
  return (
    <div
      className="mt-2 flex flex-wrap gap-2"
      aria-label="Kategori dan jenis batubara"
    >
      {categoryLabel ? (
        <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          {categoryLabel}
        </span>
      ) : null}
      {typeLabel ? (
        <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-400">
          {typeLabel}
        </span>
      ) : null}
    </div>
  );
}

/** The lot body: facts, notices, media, and the flexible specification sheet. */
export function ListingDetailBody({
  listing,
}: {
  listing: SharedListingBody;
}) {
  const hasQuantity =
    listing.quantity !== null && Number.isFinite(Number(listing.quantity));
  const availableQuantityLabel = hasQuantity
    ? formatSpecificationValue(listing.quantity ?? "", "MT")
    : "—";

  return (
    <>
      <section aria-label="Detail listing" className="mt-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {listing.origin ? (
            <DetailRow label="Asal" value={listing.origin} />
          ) : null}
          {hasQuantity ? (
            <DetailRow label="Tersedia" value={availableQuantityLabel} />
          ) : null}
          <DetailRow
            label="Harga"
            value={pricingModeDisplayLabel(listing.pricingMode) ?? "—"}
          />
        </dl>
      </section>

      {listing.category === "LOW_NO_SPEC" ? <LowNoSpecNotice /> : null}
      <InspectionNotice />

      {listing.photos.length > 0 ? (
        <PhotoGallery photos={listing.photos} label={listing.title} />
      ) : null}

      <CoaSection urls={listing.coas} />

      {listing.videos.length > 0 ? (
        <VideoSection urls={listing.videos} title={listing.title} />
      ) : null}

      <section aria-label="Spesifikasi batubara" className="mt-6">
        <SectionHeading>Spesifikasi Batubara</SectionHeading>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {listing.specifications.map((spec) => (
            <SpecCard
              key={spec.name}
              label={spec.name}
              value={formatSpecificationValue(spec.value, spec.unit)}
            />
          ))}
        </dl>
        {listing.specifications.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Spesifikasi rinci tersedia bila diminta.
          </p>
        ) : null}
      </section>
    </>
  );
}