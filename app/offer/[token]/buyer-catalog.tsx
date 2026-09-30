"use client";

import { useMemo, useState } from "react";
import {
  coalCategoryDisplayLabel,
  coalTypeDisplayLabel,
} from "@/lib/coal-specifications";
import { formatMetric } from "@/app/admin/quote-requests/format";
import type { SharedListingBody } from "@/app/listings/listing-detail";
import { ListingDetailBody, ListingHeaderChips } from "@/app/listings/listing-detail";
import { OfferActions } from "./offer-actions";

/**
 * The personalized buyer catalog: one page behind the buyer link.
 *
 * The link identifies the BUYER, not a listing. The page shows every published
 * (and sold, clearly marked) listing in the shared catalog. A coal-type
 * selector stays visible at the top - ASALAN / FINE / LAMPI (and a fallback
 * group for unspecified/SPEC_COAL lots) - and the selected type's listings
 * render BELOW the selector, so the buyer flips between types without any
 * page navigation.
 *
 * Mobile-first: the selector is the first interactive element, the selected
 * tab is visually obvious, listings stack below, and Make an Offer is a large
 * full-width CTA. Nothing here is a dashboard - just pick a coal type and make
 * an offer. No prices, no buyer identities, no commercial records: this view
 * is fed by the token-gated offer endpoint and carries listing facts only.
 */

type Buyer = {
  companyName: string | null;
  name: string | null;
};

export type BuyerListing = SharedListingBody & {
  id: string;
  status: string;
  coalType: string | null;
  typeLabel: string | null;
};

type BuyerCatalogProps = {
  token: string;
  buyer: Buyer;
  listings: BuyerListing[];
};

const EM_DASH = "—";

/** Selector tab order: the branded no-spec types, then unspecified lots. */
const TYPE_ORDER = ["ASALAN", "FINE", "LAMPI", "OTHER"] as const;

type ListingGroup = {
  /** ASALAN | FINE | LAMPI | OTHER (OTHER also covers spec lots). */
  key: string;
  label: string;
  listings: BuyerListing[];
};

function groupListings(listings: BuyerListing[]): ListingGroup[] {
  const groups = new Map<string, ListingGroup>();
  for (const listing of listings) {
    const key = listing.coalType ?? "OTHER";
    let group = groups.get(key);
    if (!group) {
      group = { key, label: key, listings: [] };
      groups.set(key, group);
    }
    group.listings.push(listing);
  }

  const ordered: ListingGroup[] = [];
  for (const key of TYPE_ORDER) {
    const group = groups.get(key);
    if (group) ordered.push(group);
  }
  // Any unexpected type value still gets a tab, after the known ones.
  for (const group of groups.values()) {
    if (!ordered.includes(group)) ordered.push(group);
  }

  return ordered.map((group) => ({
    ...group,
    // "ASALAN" -> "ASALAN"; "OTHER" -> "Other" (spec lots carry typeLabel).
    label:
      group.key === "OTHER"
        ? (group.listings[0]?.typeLabel ?? "Other")
        : (coalTypeDisplayLabel(group.key, null) ?? group.key),
  }));
}

function ListingCard({
  token,
  listing,
  companyName,
}: {
  token: string;
  listing: BuyerListing;
  /** The current buyer's company name, for the WhatsApp offer follow-up. */
  companyName: string | null;
}) {
  const isSold = listing.status === "SOLD";
  const hasQuantity =
    listing.quantity !== null && Number.isFinite(Number(listing.quantity));
  const availableQuantityLabel = hasQuantity
    ? formatMetric(listing.quantity ?? "", "MT")
    : EM_DASH;
  const availableQuantityValue = hasQuantity ? Number(listing.quantity) : null;

  return (
    <article
      aria-label={listing.title}
      className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ListingHeaderChips
            categoryLabel={coalCategoryDisplayLabel(listing.category)}
            typeLabel={coalTypeDisplayLabel(listing.coalType, listing.typeLabel)}
          />
          {isSold ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Terjual
            </span>
          ) : null}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl dark:text-slate-50">
          {listing.title}
        </h2>
        {listing.description ? (
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-400">
            {listing.description}
          </p>
        ) : null}
      </header>

      <ListingDetailBody listing={listing} />

      <section aria-label="Tindakan" className="mt-6">
        {!isSold && listing.pricingMode === "NEGOTIABLE" ? (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
            Harga dinegosiasikan langsung dengan penjual. Kirim penawaran Anda
            untuk memulai pembahasan.
          </p>
        ) : null}
        {isSold ? null : (
          <OfferActions
            token={token}
            listingId={listing.id}
            listingTitle={listing.title}
            companyName={companyName}
            availableQuantity={availableQuantityValue}
            availableQuantityLabel={availableQuantityLabel}
          />
        )}
      </section>
    </article>
  );
}

export function BuyerCatalog({ token, buyer, listings }: BuyerCatalogProps) {
  const groups = useMemo(() => groupListings(listings), [listings]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = groups.find((group) => group.key === selectedKey) ?? groups[0];

  const greeting = buyer.name?.trim() || buyer.companyName?.trim() || "";

  // The identity used to sign the WhatsApp follow-up message on the submitted
  // offer: company name first, contact name as a fallback. Sourced from the
  // token-scoped page data, i.e. always this buyer's own identity.
  const offerSenderIdentity =
    buyer.companyName?.trim() || buyer.name?.trim() || null;

  if (groups.length === 0) {
    return (
      <div>
        <header>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Penawaran Privat
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
            Halo, {greeting} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Batubara apa yang sedang Anda cari?
          </p>
        </header>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Saat ini belum ada batubara yang tersedia.
          </p>
        </div>
        <footer className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Halaman ini dibagikan secara privat kepada perusahaan Anda. Tautan
            akan kedaluwarsa otomatis dan tidak dapat diteruskan ke penerima
            lain.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div>
      <header>
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Penawaran Privat
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
          Halo, {greeting} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Batubara apa yang sedang Anda cari?
        </p>
      </header>

      <nav
        aria-label="Jenis batubara"
        className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {groups.map((group) => {
          const isSelected = selected?.key === group.key;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => setSelectedKey(group.key)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? "min-h-11 shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                  : "min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }
            >
              {group.label}
            </button>
          );
        })}
      </nav>

      {selected ? (
        <>
          {/* Which tab is active, spelled out: the selected colour alone is not
              a reliable signal, and this is the buyer's own confirmation of what
              they are looking at. */}
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Menampilkan:{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {selected.label}
            </span>
          </p>
          {selected.listings.map((listing) => (
            <ListingCard
              key={listing.id}
              token={token}
              listing={listing}
              companyName={offerSenderIdentity}
            />
          ))}
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Saat ini belum ada batubara yang tersedia.
          </p>
        </div>
      )}

      <footer className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Halaman ini dibagikan secara privat kepada perusahaan Anda. Tautan
          akan kedaluwarsa otomatis dan tidak dapat diteruskan ke penerima lain.
        </p>
      </footer>
    </div>
  );
}