import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionListingStatus,
  parseListingStatusUpdate,
  LISTING_STATUS_TRANSITIONS,
} from "../../lib/listing-status";

/**
 * Unit tests for the listing status lifecycle: DRAFT -> PUBLISHED|SOLD,
 * PUBLISHED -> DRAFT|SOLD, SOLD terminal. The same functions the API route
 * and the admin status control derive their allowed moves from.
 */

test("DRAFT can be published or sold", () => {
  assert.equal(canTransitionListingStatus("DRAFT", "PUBLISHED"), true);
  assert.equal(canTransitionListingStatus("DRAFT", "SOLD"), true);
  assert.equal(canTransitionListingStatus("DRAFT", "DRAFT"), false);
});

test("PUBLISHED can be unpublished or sold", () => {
  assert.equal(canTransitionListingStatus("PUBLISHED", "DRAFT"), true);
  assert.equal(canTransitionListingStatus("PUBLISHED", "SOLD"), true);
  assert.equal(canTransitionListingStatus("PUBLISHED", "PUBLISHED"), false);
});

test("SOLD is terminal", () => {
  assert.equal(canTransitionListingStatus("SOLD", "DRAFT"), false);
  assert.equal(canTransitionListingStatus("SOLD", "PUBLISHED"), false);
  assert.equal(canTransitionListingStatus("SOLD", "SOLD"), false);
  assert.deepEqual(LISTING_STATUS_TRANSITIONS.SOLD, []);
});

test("parseListingStatusUpdate accepts a known status", () => {
  const result = parseListingStatusUpdate({ status: "PUBLISHED" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.status, "PUBLISHED");
});

test("parseListingStatusUpdate rejects unknown, missing, or malformed statuses", () => {
  assert.equal(parseListingStatusUpdate({ status: "BOGUS" }).ok, false);
  assert.equal(parseListingStatusUpdate({}).ok, false);
  assert.equal(parseListingStatusUpdate({ status: 42 }).ok, false);
  assert.equal(parseListingStatusUpdate(null).ok, false);
  assert.equal(parseListingStatusUpdate("PUBLISHED").ok, false);
});