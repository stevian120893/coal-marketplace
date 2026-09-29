import { createJiti } from "jiti";
import dotenv from "dotenv";
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
  "./unit/base-path.test.ts",
];
for (const suite of suites) {
  await jiti.import(suite);
}
