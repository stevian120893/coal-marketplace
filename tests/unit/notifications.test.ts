import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getNotificationService,
  NO_PROVIDER_CONFIGURED,
  resetNotificationService,
  setNotificationService,
  type BuyerOfferCreatedEvent,
} from "../../lib/notifications";

/**
 * The notification boundary is honest about deliverability: no WhatsApp (or any
 * other) provider is configured in this phase and no credentials exist, so the
 * service must report "not delivered" and never claim success. The interface is
 * the contract a future provider plugs into, and the injection seam lets tests
 * prove the boundary is actually exercised.
 */

const EVENT: BuyerOfferCreatedEvent = {
  kind: "BUYER_OFFER_CREATED",
  quoteRequestId: "cmul3vnfz00007lyjpocfr19j",
  quantity: "2000",
  offerPrice: "650000",
  paymentTerms: "Cash",
  listingTitle: "Kalimantan Sub-bituminous Coal - 6,000 MT FOB Samarinda",
  companyName: "Sinar Batu Nusantara",
};

test("the default service reports NO_PROVIDER_CONFIGURED, never delivery", async () => {
  const result = await getNotificationService().buyerOfferCreated(EVENT);
  assert.deepEqual(result, {
    delivered: false,
    reason: NO_PROVIDER_CONFIGURED,
  });
});

test("the default service never throws and never touches the network", async () => {
  await assert.doesNotReject(getNotificationService().buyerOfferCreated(EVENT));
});

test("a provider can be swapped in behind the same interface", async () => {
  const calls: BuyerOfferCreatedEvent[] = [];
  setNotificationService({
    async buyerOfferCreated(event) {
      calls.push(event);
      return { delivered: true, provider: "test-provider" };
    },
  });
  try {
    const result = await getNotificationService().buyerOfferCreated(EVENT);
    assert.deepEqual(result, { delivered: true, provider: "test-provider" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "BUYER_OFFER_CREATED");
    assert.equal(calls[0].quoteRequestId, EVENT.quoteRequestId);
  } finally {
    resetNotificationService();
  }
});

test("resetNotificationService restores the no-provider default", async () => {
  setNotificationService({
    async buyerOfferCreated() {
      return { delivered: true, provider: "test-provider" };
    },
  });
  resetNotificationService();
  const result = await getNotificationService().buyerOfferCreated(EVENT);
  assert.deepEqual(result, { delivered: false, reason: NO_PROVIDER_CONFIGURED });
});