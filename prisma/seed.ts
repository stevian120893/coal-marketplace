/**
 * Development seed data.
 *
 * Creates exactly three rows: one BUYER, one PUBLISHED CoalListing with sample
 * coal specifications, and one AccessToken that links the buyer to that
 * listing. Safe to re-run against a local database.
 *
 * Idempotency: the user and the listing use fixed ids and are upserted, so
 * repeated runs converge on the same two rows and reset any local edits back
 * to the canonical sample values. The access token is deleted and recreated on
 * every run, because only its hash is stored and the previous raw token is
 * therefore unrecoverable - which also means a fresh raw token is printed each
 * time you seed.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";

const BUYER_ID = "seed-user-buyer";
const LISTING_ID = "seed-listing-001";
const TOKEN_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 32 bytes = 256 bits of entropy, base64url so it is URL-safe as-is. */
function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is ever persisted or logged. */
function hashRawToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Keeps connection strings and credentials out of seed output. */
function redact(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/password=\S+/gi, "password=[redacted]");
}

const buyerData = {
  id: BUYER_ID,
  companyName: "Sinar Batu Nusantara",
  name: "Andi Prasetyo",
  phone: "+62 812 0000 0000",
  // .test is reserved for testing, so this can never collide with a real inbox.
  email: "seed-buyer@local.test",
  role: "BUYER",
  status: "ACTIVE",
} as const;

const listingData = {
  id: LISTING_ID,
  title: "Kalimantan Sub-bituminous Coal - 6,000 MT FOB Samarinda",
  description:
    "Low / no spec coal from the ASALAN run. Specifications are indicative; physical inspection is recommended before purchase.",
  category: "LOW_NO_SPEC",
  coalType: "ASALAN",
  origin: "Kalimantan, Indonesia",
  // Pricing is negotiated; no public price is stored on the listing.
  pricingMode: "NEGOTIABLE",
  quantity: 6000, // tonnes
  status: "PUBLISHED",
} as const;

/** Canonical specification sheet, stored in the flexible spec table. */
const listingSpecifications = [
  { name: "GAR", value: "5041", unit: "kcal/kg" }, // gross as received
  { name: "TM", value: "22", unit: "%" }, // total moisture as received
  { name: "Ash", value: "8.5", unit: "%" },
  { name: "Sulfur", value: "0.65", unit: "%" },
] as const;

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set - cannot seed.");
  }

  const rawToken = generateRawToken();
  const tokenHash = hashRawToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * DAY_MS);

  const buyer = await prisma.user.upsert({
    where: { id: BUYER_ID },
    create: buyerData,
    update: buyerData,
  });

  const listing = await prisma.coalListing.upsert({
    where: { id: LISTING_ID },
    create: listingData,
    update: listingData,
  });

  // Replace the specification sheet rather than accumulate: the fixed spec
  // columns are deprecated, so the flexible model is the only place the seed
  // writes specifications.
  const specifications = await prisma.$transaction(async (tx) => {
    await tx.coalSpecification.deleteMany({
      where: { coalListingId: listing.id },
    });
    return tx.coalSpecification.createMany({
      data: listingSpecifications.map((spec) => ({
        coalListingId: listing.id,
        name: spec.name,
        value: spec.value,
        unit: spec.unit,
      })),
    });
  });

  // Replace rather than accumulate: one token per buyer/listing pair, and the
  // unique tokenHash index means an accidental duplicate insert would throw.
  const token = await prisma.$transaction(async (tx) => {
    await tx.accessToken.deleteMany({
      where: { userId: buyer.id, coalListingId: listing.id },
    });
    return tx.accessToken.create({
      data: { userId: buyer.id, coalListingId: listing.id, tokenHash, expiresAt },
    });
  });

  console.log("Seed complete.");
  console.log(`  buyer   ${buyer.id} <${buyer.email ?? "no email"}>`);
  console.log(`  listing ${listing.id} "${listing.title}"`);
  console.log(`  specs   ${specifications.count} specification row(s)`);
  console.log(`  token   expires ${token.expiresAt.toISOString()}`);
  console.log("");
  console.log("Raw access token (shown once, stored only as a SHA-256 hash):");
  console.log(rawToken);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${redact(message)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
