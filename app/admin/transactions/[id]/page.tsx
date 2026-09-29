import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAdminApi } from "@/lib/server-api";
import { requireAdminPage } from "@/lib/admin/authorize";
import type {
  AdminTransactionDetailResponse,
  AdminTransactionDetail,
  AdminSourceOfferSummary,
} from "@/lib/quote-requests";
import { TRANSACTION_STATUS_TRANSITIONS } from "@/lib/transaction-status";
import { buildSendDealWhatsAppUrl } from "@/lib/whatsapp";
import {
  coalCategoryDisplayLabel,
  pricingModeDisplayLabel,
  formatSpecificationValue,
} from "@/lib/coal-specifications";
import {
  formatDateTime,
  formatMetric,
  formatPrice,
  formatText,
  statusLabel,
  transactionStatusLabel,
} from "../../quote-requests/format";
import { AdminNav } from "../../admin-nav";
import {
  AdminIdentityBar,
  DetailRow,
  EM_DASH,
  EmptyState,
  SectionCard,
} from "../../quote-requests/ui";
import { TransactionStatusControl } from "../transaction-status-control";

/**
 * Admin detail view for one final Transaction.
 *
 * Data comes from /api/admin/transactions/[id]. The sections map to the four
 * groups the API returns - transaction, buyer, coal, and the source Buyer
 * Offer - and the Transaction Price is shown distinctly from the buyer's
 * original Offer Price. The source offer is a read-only reference: it links to
 * the existing Buyer Offer page but can never be edited from here.
 *
 * The Transaction Status control is a small client island that PATCHes the
 * shared status endpoint and re-reads the page from the server, keeping the
 * server authoritative. COMPLETED and CANCELLED are terminal: those screens
 * only explain that the record is closed - they never claim payment, shipment,
 * or settlement happened, because this system does not track those.
 */

export const metadata: Metadata = {
  title: "Transaksi · Admin",
  description: "Detail kesepakatan final dengan pengelolaan status.",
};

/**
 * The record is fetched in the page component, before any HTML is flushed.
 * Deferring it into a Suspense boundary would stream a 200 shell first, and a
 * notFound() raised after that point could no longer change the status - a
 * missing transaction would be served as a soft 404. Fetching up front keeps
 * the response a real 404.
 */
async function loadTransaction(id: string) {
  const result = await fetchAdminApi<AdminTransactionDetailResponse>(
    `/api/admin/transactions/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }
    return null;
  }

  return result.data;
}

/** The final agreed price, shown as the headline of the Transaction card. */
function TransactionPriceHighlight({ price }: { price: string }) {
  return (
    <div className="rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-950/40">
      <h3 className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
        Harga Transaksi
      </h3>
      <p className="mt-1 text-lg font-semibold text-emerald-900 tabular-nums dark:text-emerald-100">
        {formatPrice(price)}
        <span className="text-base font-medium text-emerald-700/70 dark:text-emerald-300/70">
          {" "}
          / MT
        </span>
      </p>
      <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
        Harga komersial final yang disepakati untuk transaksi ini.
      </p>
    </div>
  );
}

/**
 * Seller -> buyer WhatsApp deep link. Reuses the provider-free implementation
 * from lib/whatsapp.ts: a plain wa.me URL prefilled with the final deal, sent
 * by the seller's own WhatsApp account - the marketplace never sends messages.
 */
function SendDealLink({
  buyerPhone,
  buyerName,
  listingTitle,
  transaction,
}: {
  buyerPhone: string | null;
  buyerName: string | null;
  listingTitle: string;
  transaction: AdminTransactionDetail;
}) {
  const whatsappUrl = buildSendDealWhatsAppUrl(buyerPhone, {
    buyerName,
    listingTitle,
    quantity: transaction.quantity,
    price: transaction.price,
    paymentTerms: transaction.paymentTerms,
    transactionId: transaction.id,
  });

  if (whatsappUrl === null) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nomor WhatsApp pembeli belum tersedia.
      </p>
    );
  }

  return (
    <>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
      >
        Kirim Kesepakatan via WhatsApp
      </a>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Tautan ini hanya membuka WhatsApp dengan pesan kesepakatan yang sudah
        terisi. Pesan dikirim dari akun WhatsApp penjual sendiri; sistem tidak
        pernah mengirim pesan.
      </p>
    </>
  );
}

/**
 * The historical Buyer Offer this deal came from - read-only here. Its Offer
 * Price stays visually separated from the Transaction Price, and the only
 * path into it links to the dedicated Buyer Offer screen.
 */
function SourceOfferCard({
  sourceOffer,
  listingTitle,
}: {
  sourceOffer: AdminSourceOfferSummary;
  listingTitle: string;
}) {
  return (
    <SectionCard title="Penawaran Pembeli Asal">
      <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Penawaran Pembeli
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Harga Penawaran
          </span>
          <span className="text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-50">
            {formatPrice(sourceOffer.offerPrice)}
            <span className="text-base font-medium text-slate-500 dark:text-slate-400">
              {" "}
              / MT
            </span>
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Proposal asli dari pembeli. Kesepakatan yang disepakati — kuantitas
          final dan Harga Transaksi — dicatat secara terpisah.
        </p>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailRow
          label="Kuantitas Penawaran"
          value={formatMetric(sourceOffer.quantity, "MT", {
            maximumFractionDigits: 3,
          })}
        />
        <DetailRow label="Status" value={statusLabel(sourceOffer.status)} />
        <DetailRow
          label="Diajukan"
          value={formatDateTime(sourceOffer.createdAt)}
        />
        <DetailRow
          label="ID Penawaran"
          value={sourceOffer.id}
          className="sm:col-span-2"
        />
      </dl>

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        <Link
          href={`/admin/quote-requests/${sourceOffer.id}`}
          className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Lihat Penawaran Pembeli
        </Link>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {listingTitle} — penawaran asal bersifat hanya-baca di sini dan tidak
        pernah diubah dari layar Transaksi.
      </p>
    </SectionCard>
  );
}

function TransactionDeal({
  data,
}: {
  data: AdminTransactionDetailResponse;
}) {
  const { transaction, buyer, coalListing, sourceOffer } = data;
  const allowedStatuses = TRANSACTION_STATUS_TRANSITIONS[transaction.status];
  const listingTitle = coalListing.title;

  return (
    <article className="mt-6 space-y-4">
      <SectionCard title="Transaksi">
        <TransactionPriceHighlight price={transaction.price} />

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <DetailRow
            label="Kuantitas Kesepakatan"
            value={formatMetric(transaction.quantity, "MT", {
              maximumFractionDigits: 3,
            })}
          />
          <DetailRow
            label="Syarat Pembayaran"
            value={formatText(transaction.paymentTerms)}
          />
          <DetailRow
            label="ID Transaksi"
            value={transaction.id}
            className="sm:col-span-2"
          />
          <DetailRow
            label="Dibuat"
            value={formatDateTime(transaction.createdAt)}
          />
          <DetailRow
            label="Diperbarui"
            value={formatDateTime(transaction.updatedAt)}
          />
        </dl>

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <TransactionStatusControl
            transactionId={transaction.id}
            currentStatus={transaction.status}
            allowedStatuses={allowedStatuses}
          />
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <SendDealLink
            buyerPhone={buyer.phone}
            buyerName={buyer.name}
            listingTitle={listingTitle}
            transaction={transaction}
          />
        </div>

        {transaction.status === "COMPLETED" && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Catatan marketplace sudah selesai. Pembayaran, pengiriman, dan
            penyelesaian dilakukan di luar sistem ini dan tidak ditampilkan di
            sini.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Pembeli">
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailRow
            label="Nama Perusahaan"
            value={formatText(buyer.companyName)}
          />
          <DetailRow label="Nama Kontak" value={formatText(buyer.name)} />
          <DetailRow
            label="Nomor Telepon"
            value={formatText(buyer.phone)}
            className="sm:col-span-2"
          />
          <DetailRow
            label="Email"
            value={formatText(buyer.email)}
            className="sm:col-span-2"
          />
        </dl>
      </SectionCard>

      <SectionCard title="Batubara">
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailRow
            label="Judul"
            value={formatText(coalListing.title)}
            className="sm:col-span-2"
          />
          <DetailRow
            label="Kategori"
            value={coalCategoryDisplayLabel(coalListing.category) ?? EM_DASH}
          />
          {coalListing.typeLabel ? (
            <DetailRow
              label="Jenis Batubara"
              value={formatText(coalListing.typeLabel)}
            />
          ) : coalListing.coalType ? (
            <DetailRow
              label="Jenis Batubara"
              value={formatText(coalListing.coalType)}
            />
          ) : (
            <DetailRow label="Jenis Batubara" value={EM_DASH} />
          )}
          <DetailRow label="Asal" value={formatText(coalListing.origin)} />
          <DetailRow
            label="Mode Harga"
            value={pricingModeDisplayLabel(coalListing.pricingMode) ?? EM_DASH}
          />
          {coalListing.specifications.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Spesifikasi Batubara
              </dt>
              <dd className="mt-1">
                <dl className="grid gap-x-5 gap-y-1 sm:grid-cols-3">
                  {coalListing.specifications.map((spec) => (
                    <div
                      key={spec.name}
                      className="flex items-baseline gap-1.5 text-sm"
                    >
                      <dt className="text-slate-500 dark:text-slate-400">
                        {spec.name}
                      </dt>
                      <dd className="font-medium text-slate-900 tabular-nums dark:text-slate-50">
                        {formatSpecificationValue(spec.value, spec.unit)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </dd>
            </div>
          ) : (
            <DetailRow
              label="Spesifikasi Batubara"
              value="Tidak diisi"
              className="sm:col-span-2"
            />
          )}
          <DetailRow
            label="Kuantitas Tersedia"
            value={formatMetric(coalListing.quantity, "MT", {
              maximumFractionDigits: 3,
            })}
            className="sm:col-span-2"
          />
        </dl>
      </SectionCard>

      <SourceOfferCard sourceOffer={sourceOffer} listingTitle={listingTitle} />
    </article>
  );
}

export default async function TransactionDetailPage(
  props: PageProps<"/admin/transactions/[id]">,
) {
  // Authorised before the record is fetched, so a missing session never
  // reaches the detail endpoint.
  const admin = await requireAdminPage();
  const { id } = await props.params;
  const data = await loadTransaction(id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/admin/transactions"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
      >
        <span aria-hidden="true">&larr;</span>
        Semua transaksi
      </Link>

      <header className="mt-4">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Admin
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
          {data === null ? (
            "Transaksi"
          ) : (
            <>
              Transaksi{" "}
              <span className="text-base font-medium text-slate-500 dark:text-slate-400">
                · {transactionStatusLabel(data.transaction.status)}
              </span>
            </>
          )}
        </h1>
      </header>

      <AdminNav active="transactions" />

      <AdminIdentityBar email={admin.email} />

      {data === null ? (
        <div className="mt-6">
          <EmptyState
            title="Transaksi tidak dapat dimuat"
            body="Layanan admin tidak merespons. Kembali ke daftar dan coba lagi."
          />
        </div>
      ) : (
        <TransactionDeal data={data} />
      )}
    </main>
  );
}