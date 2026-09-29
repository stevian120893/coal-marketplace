-- 0002_buyer_wide_access_tokens.sql
--
-- AccessToken.coalListingId becomes nullable: magic links now identify the
-- BUYER, not a buyer+listing pair. A valid link lets the buyer browse every
-- published listing and choose which one to make an offer on, so new tokens
-- omit coalListingId entirely. Legacy rows (like the seed token) keep their
-- historical listing reference untouched.
--
-- Non-destructive: existing rows are preserved and nothing is rewritten.
-- This is applied against the live PostgreSQL database with the same command
-- as migration 0001:
--
--   npx prisma db execute --file prisma/migrations/0002_buyer_wide_access_tokens.sql
--
-- The guard makes it idempotent, so running it twice is harmless. The whole
-- migration runs in one transaction. prisma/init.sql is updated separately for
-- fresh bootstrap and must NOT be run against an existing database.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AccessToken'
      AND column_name = 'coalListingId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "AccessToken" ALTER COLUMN "coalListingId" DROP NOT NULL;
  END IF;
END $$;

COMMIT;