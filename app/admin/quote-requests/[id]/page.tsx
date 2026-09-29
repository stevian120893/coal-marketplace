import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAdminApi } from "@/lib/server-api";
import { requireAdminPage } from "@/lib/admin/authorize";
import type {
  AdminTransactionDetail,
  QuoteRequestDetailResponse,
} from "@/lib/quote-requests";
import { OFFER_STATUS_TRANSITIONS } from "@/lib/offer-status";
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
  transactionStatusLabel,
} from "../format";
import { OfferStatusControl } from "../offer-status-control";
import { FinalizationForm } from "../finalization-form";
import { AdminNav } from "../../admin-nav";
import {
  AdminIdentityBar,
  DetailRow,
  EM_DASH,
  EmptyState,
  SectionCard,
} from "../ui";

/**
 * Admin detail view for one buyer offer.
 *
 * Data comes from /api/admin/quote-requests/[id]. The sections map to the three
 * groups the API returns - buyer, coal, and offer - and the offer card makes
 * the buyer's proposed price visually distinct from the final deal.
 *
 * An offer that is still being negotiated (IN_NEGOTIATION) and has no
 * Transaction yet shows the "Finalisasi Kesepakatan" card: submitting it
 * finalizes the deal, creating the Transaction and marking the offer Disepakati
 * in one server-side commit. Once a Transaction exists it is shown as a separate
 * card with its own price and the seller -> buyer WhatsApp deep link. There is no
 * separate "accept" step.
 *
 * The Offer Status control is a small client island that PATCHes the shared
 * status endpoint and re-reads the page from the server, keeping the server
 * authoritative.
 */

export const metadata: Metadata = {
  title: "Penawaran Pembeli · Admin",
  description: "Detail penawaran pembeli beserta status dan transaksinya.",
};

/**
 * The record is fetched in the page component, before any HTML is flushed.
 * Deferring it into a Suspense boundary would stream a 200 shell first, and a
 * notFound() raised after that point could no longer change the status - a
 * missing request would be served as a soft 404. Fetching up front keeps the
 * response a real 404.
 */
async function loadQuoteRequest(id: string) {
  const result = await fetchAdminApi<QuoteRequestDetailResponse>(
    `/api/admin/quote-requests/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    if (result.status === 404) {
      notFound();
    }
    return null;
  }

  return result.data;
}

function OfferHighlight({
  quantity,
  offerPrice,
}: {
  quantity: string;
  offerPrice: string | null;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
      <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        Penawaran Pembeli
      </h3>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Harga Penawaran
        </span>
        <span className="text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-50">
          {formatPrice(offerPrice)}
          <span className="text-base font-medium text-slate-500 dark:text-slate-400">
            {" "}
            / MT
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Kuantitas
        </span>
        <span className="text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-50">
          {formatMetric(quantity, "MT", { maximumFractionDigits: 3 })}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Ini adalah harga yang ditawarkan pembeli, bukan harga kesepakatan. Harga
        yang disepakati dicatat terpisah sebagai Transaksi.
      </p>
    </div>
  );
}

/** Explains that negotiation happens outside this system, not inside it. */
function NegotiationNotice() {
  return (
    <SectionCard title="Negosiasi">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Bahas penawaran dengan pembeli secara langsung melalui telepon atau
        WhatsApp.
      </p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Sistem ini mencatat penawaran pembeli beserta statusnya. Ketentuan
        komersial hasil negosiasi dicatat terpisah sebagai Transaksi melalui
        Finalisasi Kesepakatan.
      </p>
    </SectionCard>
  );
}

/**
 * The final agreed deal, shown as its own record beside the Buyer Offer. The
 * Transaction price is visually distinct from the buyer's proposed price, and
 * the seller -> buyer WhatsApp link opens the buyer's chat with the deal
 * details prefilled (the marketplace itself never sends anything).
 */
function FinalTransactionCard({
  transaction,
  buyerPhone,
  buyerName,
  listingTitle,
}: {
  transaction: AdminTransactionDetail;
  buyerPhone: string | null;
  buyerName: string | null;
  listingTitle: string;
}) {
  const whatsappUrl = buildSendDealWhatsAppUrl(buyerPhone, {
    buyerName,
    listingTitle,
    quantity: transaction.quantity,
    price: transaction.price,
    paymentTerms: transaction.paymentTerms,
    transactionId: transaction.id,
  });

  return (
    <SectionCard title="Transaksi">
      <div className="rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-950/40">
        <h3 className="text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-300">
          Harga Transaksi
        </h3>
        <p className="mt-1 text-lg font-semibold text-emerald-900 tabular-nums dark:text-emerald-100">
          {formatPrice(transaction.price)}
          <span className="text-base font-medium text-emerald-700/70 dark:text-emerald-300/70">
            {" "}
            / MT
          </span>
        </p>
      </div>

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
          label="Status"
          value={transactionStatusLabel(transaction.status)}
        />
        <DetailRow
          label="Dibuat"
          value={formatDateTime(transaction.createdAt)}
        />
        <DetailRow
          label="ID Transaksi"
          value={transaction.id}
          className="sm:col-span-2"
        />
      </dl>

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        {whatsappUrl === null ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nomor WhatsApp pembeli belum tersedia. Kirim rincian kesepakatan
            secara manual.
          </p>
        ) : (
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
              Tautan ini hanya membuka WhatsApp dengan pesan kesepakatan yang
              sudah terisi. Pesan dikirim dari akun WhatsApp Anda sendiri;
              sistem tidak pernah mengirim pesan.
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function QuoteRequestDetail({ data }: { data: QuoteRequestDetailResponse }) {
  const { quoteRequest } = data;
  const { buyer, coalListing } = quoteRequest;
  const allowedStatuses = OFFER_STATUS_TRANSITIONS[quoteRequest.status];
  const transaction = quoteRequest.transaction;
  // Finalization is only offered while the deal is being negotiated and has not
  // been recorded yet; once a Transaction exists the offer is closed.
  const canFinalize = quoteRequest.status === "IN_NEGOTIATION" && transaction === null;
  const availableQuantityLabel = formatMetric(coalListing.quantity, "MT", {
    maximumFractionDigits: 3,
  });

  return (
    <article className="mt-6 space-y-4">
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
            value={availableQuantityLabel}
            className="sm:col-span-2"
          />
        </dl>
      </SectionCard>

      <SectionCard title="Penawaran Pembeli">
        <OfferHighlight
          quantity={quoteRequest.quantity}
          offerPrice={quoteRequest.offerPrice}
        />

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <DetailRow
            label="Syarat Pembayaran"
            value={formatText(quoteRequest.paymentTerms)}
          />
          <DetailRow
            label="Diajukan"
            value={formatDateTime(quoteRequest.createdAt)}
          />
          <DetailRow
            label="Terakhir Diperbarui"
            value={formatDateTime(quoteRequest.updatedAt)}
          />
          <DetailRow
            label="ID Penawaran"
            value={quoteRequest.id}
            className="sm:col-span-2"
          />
        </dl>

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <OfferStatusControl
            offerId={quoteRequest.id}
            currentStatus={quoteRequest.status}
            allowedStatuses={allowedStatuses}
          />
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Catatan
          </h3>
          {quoteRequest.notes === null || quoteRequest.notes.trim() === "" ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tidak ada catatan.
            </p>
          ) : (
            <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {quoteRequest.notes}
            </p>
          )}
        </div>
      </SectionCard>

      {canFinalize && (
        <SectionCard title="Finalisasi Kesepakatan">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Catat ketentuan komersial yang telah disepakati. Penawaran akan
            berstatus Disepakati dan Transaksi baru dibuat dengan status
            Dikonfirmasi dalam satu langkah. Penawaran asli pembeli tidak diubah.
          </p>

          <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Penawaran Pembeli (referensi)
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-50">
              {formatMetric(quoteRequest.quantity, "MT", {
                maximumFractionDigits: 3,
              })}{" "}
              · {formatPrice(quoteRequest.offerPrice)} / MT
            </p>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <FinalizationForm
              offerId={quoteRequest.id}
              defaultQuantity={quoteRequest.quantity}
              defaultPaymentTerms={quoteRequest.paymentTerms}
              maxQuantityLabel={availableQuantityLabel}
            />
          </div>
        </SectionCard>
      )}

      {transaction !== null && (
        <FinalTransactionCard
          transaction={transaction}
          buyerPhone={buyer.phone}
          buyerName={buyer.name}
          listingTitle={coalListing.title}
        />
      )}

      <NegotiationNotice />
    </article>
  );
}

export default async function QuoteRequestDetailPage(
  props: PageProps<"/admin/quote-requests/[id]">,
) {
  // Authorised before the record is fetched, so a missing session never
  // reaches the detail endpoint.
  const admin = await requireAdminPage();
  const { id } = await props.params;
  const data = await loadQuoteRequest(id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/admin/quote-requests"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
      >
        <span aria-hidden="true">&larr;</span>
        Semua penawaran pembeli
      </Link>

      <header className="mt-4">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Admin
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-50">
          Penawaran Pembeli
        </h1>
      </header>

      <AdminNav active="offers" />

      <AdminIdentityBar email={admin.email} />

      {data === null ? (
        <div className="mt-6">
          <EmptyState
            title="Penawaran tidak dapat dimuat"
            body="Layanan admin tidak merespons. Kembali ke daftar dan coba lagi."
          />
        </div>
      ) : (
        <QuoteRequestDetail data={data} />
      )}
    </main>
  );
}
