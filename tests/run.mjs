/**
 * Test runner.
 *
 * Runs the node:test suites after loading them through jiti, which is what
 * lets .ts test files import "@/..." (tsconfig paths) and the .ts sources in
 * lib/ and app/ the same way the app does.
 *
 *   npm test  ->  node tests/run.mjs
 *
 * node:test reports a TAP-like summary and sets a non-zero exit code when any
 * test fails, so CI can depend on the exit status alone.
 */
import { createJiti } from "jiti";
import dotenv from "dotenv";

// Loads .env so the suite talks to the same DATABASE_URL the app uses.
dotenv.config({ quiet: true });

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const suites = [
  "./unit/buyer-offer.test.ts",
  "./unit/coal-specifications.test.ts",
  "./unit/status-vocabulary.test.ts",
  "./unit/offer-status.test.ts",
  "./unit/transaction-status.test.ts",
  "./unit/notifications.test.ts",
  "./unit/final-transaction.test.ts",
  "./unit/whatsapp.test.ts",
  "./unit/ui-contract.test.ts",
  "./unit/ui-terminology.test.ts",
  "./unit/listing-input.test.ts",
  "./unit/buyer-input.test.ts",
  "./unit/listing-status.test.ts",
  "./unit/access-links.test.ts",
  "./unit/offer-link.test.ts",
  "./integration/offer-flow.test.ts",
  "./integration/admin-flow.test.ts",
  "./integration/transaction-flow.test.ts",
  "./integration/admin-operations.test.ts",
  "./integration/buyer-privacy.test.ts",
];

for (const suite of suites) {
  await jiti.import(suite);
}