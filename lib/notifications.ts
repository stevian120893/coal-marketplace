/**
 * Notification boundary for buyer offers.
 *
 * The long-term business flow alerts the seller when a buyer submits an offer
 * (WhatsApp-style). No provider is configured in this phase and none may be
 * invented: there are no third-party credentials in this environment, so the
 * app must never pretend a message was delivered.
 *
 * The default service therefore answers NO_PROVIDER_CONFIGURED for every event
 * without touching the network. The interface below is the contract a future
 * WhatsApp provider has to fulfil, and the quote route calls it at the exact
 * point an offer is stored - that call site is the seam where delivery lands.
 *
 * Delivery is always best-effort: a notification failure must never turn a
 * successfully stored offer into an error reply, and no response body ever
 * claims a notification was sent.
 */

export type BuyerOfferCreatedEvent = {
  kind: "BUYER_OFFER_CREATED";
  quoteRequestId: string;
  /** Decimal-safe strings; no precision is lost in transit. */
  quantity: string;
  offerPrice: string | null;
  paymentTerms: string | null;
  listingTitle: string;
  companyName: string | null;
};

export type NotificationDeliveryResult =
  | { delivered: true; provider: string }
  | { delivered: false; reason: string };

export interface NotificationService {
  buyerOfferCreated(
    event: BuyerOfferCreatedEvent,
  ): Promise<NotificationDeliveryResult>;
}

export const NO_PROVIDER_CONFIGURED = "NO_PROVIDER_CONFIGURED";

/** Honest no-op: nothing was delivered, and it says so. */
const noProviderService: NotificationService = {
  async buyerOfferCreated() {
    return { delivered: false, reason: NO_PROVIDER_CONFIGURED };
  },
};

let activeService: NotificationService = noProviderService;

export function getNotificationService(): NotificationService {
  return activeService;
}

/**
 * Swaps the active provider. Used by the test suite to inject a probe and by a
 * future integration point when a real WhatsApp provider is configured.
 */
export function setNotificationService(service: NotificationService): void {
  activeService = service;
}

/** Restores the no-provider default (used after tests inject a probe). */
export function resetNotificationService(): void {
  activeService = noProviderService;
}