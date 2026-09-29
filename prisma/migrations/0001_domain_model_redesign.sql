-- 0001_domain_model_redesign.sql
--
-- Domain-model redesign for the actual business workflow:
--
--   CoalListing -> Buyer Offer (QuoteRequest) -> manual negotiation -> Transaction
--
-- Non-destructive: existing rows are preserved and only backfilled. This is
-- applied against the live cPanel PostgreSQL database with:
--
--   npx prisma db execute --file prisma/migrations/0001_domain_model_redesign.sql
--
-- (`prisma migrate dev` cannot be used here: the database user has no CREATEDB
-- privilege.) prisma/init.sql is updated separately for fresh bootstrap and must
-- NOT be run against an existing database.
--
-- The whole migration runs in one transaction, so a failure anywhere rolls back
-- every statement - including the QuoteRequestStatus enum rebuild.

BEGIN;

-- Guard: refuse to run twice. If CoalVideo already exists this migration was
-- already applied.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CoalVideo'
  ) THEN
    RAISE EXCEPTION 'Migration 0001 already applied (CoalVideo exists). Refusing to re-run.';
  END IF;
END $$;

-- 1. New domain enums -----------------------------------------------

CREATE TYPE "CoalCategory" AS ENUM ('LOW_NO_SPEC', 'SPEC_COAL');

CREATE TYPE "CoalType" AS ENUM ('ASALAN', 'FINE', 'LAMPI', 'OTHER');

CREATE TYPE "PricingMode" AS ENUM ('NEGOTIABLE', 'FIXED');

-- 2. CoalListing: category / type / label / pricing mode / description -----

ALTER TABLE "CoalListing"
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "category" "CoalCategory",
    ADD COLUMN IF NOT EXISTS "coalType" "CoalType",
    ADD COLUMN IF NOT EXISTS "typeLabel" TEXT,
    ADD COLUMN IF NOT EXISTS "pricingMode" "PricingMode" NOT NULL DEFAULT 'NEGOTIABLE';

-- 3. Flexible specifications -----------------------------------------------
--
-- A flat name/value/unit table (deliberately not a full EAV system) so future
-- specifications (NAR, HGI, ADB, ARB, ...) need no schema change.

CREATE TABLE "CoalSpecification" (
    "id" TEXT NOT NULL,
    "coalListingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoalSpecification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoalSpecification_coalListingId_idx" ON "CoalSpecification"("coalListingId");

ALTER TABLE "CoalSpecification"
    ADD CONSTRAINT "CoalSpecification_coalListingId_fkey"
    FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copy the legacy fixed columns into the flexible model so no data
-- is lost. GAR is kcal/kg, the rest are percentages. Only rows with a value are
-- copied; spec entries named GAR/TM/Ash/Sulfur override these on read.
INSERT INTO "CoalSpecification" ("id", "coalListingId", "name", "value", "unit", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'GAR', "gar"::text, 'kcal/kg', now(), now()
FROM "CoalListing" WHERE "gar" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "CoalSpecification" ("id", "coalListingId", "name", "value", "unit", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'TM', "tm"::text, '%', now(), now()
FROM "CoalListing" WHERE "tm" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "CoalSpecification" ("id", "coalListingId", "name", "value", "unit", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'Ash', "ash"::text, '%', now(), now()
FROM "CoalListing" WHERE "ash" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "CoalSpecification" ("id", "coalListingId", "name", "value", "unit", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'Sulfur', "sulfur"::text, '%', now(), now()
FROM "CoalListing" WHERE "sulfur" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. CoalVideo (data model only; no upload pipeline yet) --------------------

CREATE TABLE "CoalVideo" (
    "id" TEXT NOT NULL,
    "coalListingId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoalVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoalVideo_coalListingId_idx" ON "CoalVideo"("coalListingId");

ALTER TABLE "CoalVideo"
    ADD CONSTRAINT "CoalVideo_coalListingId_fkey"
    FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. QuoteRequest.offerPrice ------------------------------------------------

ALTER TABLE "QuoteRequest"
    ADD COLUMN IF NOT EXISTS "offerPrice" DECIMAL(14,2);

-- 6. QuoteRequestStatus: QUOTED -> IN_NEGOTIATION ---------------------------
--
-- The seller never issues a digital quote/counter-offer, so QUOTED is removed.
-- Rebinding the enum is done by recreating the type, which is fully
-- transactional and works on PostgreSQL 13 (ADD/DROP VALUE are not available in
-- a transaction on this version).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "QuoteRequest" WHERE "status" = 'QUOTED') THEN
    RAISE EXCEPTION
      'Cannot remove QUOTED: % row(s) still use it. Update them first.',
      (SELECT count(*) FROM "QuoteRequest" WHERE "status" = 'QUOTED');
  END IF;
END $$;

CREATE TYPE "QuoteRequestStatus_new" AS ENUM ('PENDING', 'IN_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'CANCELLED');

ALTER TABLE "QuoteRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "QuoteRequest"
    ALTER COLUMN "status" TYPE "QuoteRequestStatus_new"
    USING "status"::text::"QuoteRequestStatus_new";
ALTER TABLE "QuoteRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"QuoteRequestStatus_new";

DROP TYPE "QuoteRequestStatus";
ALTER TYPE "QuoteRequestStatus_new" RENAME TO "QuoteRequestStatus";

-- 7. Indexes for future filtering on listing family/type ---------------------

CREATE INDEX IF NOT EXISTS "CoalListing_category_idx" ON "CoalListing"("category");
CREATE INDEX IF NOT EXISTS "CoalListing_coalType_idx" ON "CoalListing"("coalType");

COMMIT;