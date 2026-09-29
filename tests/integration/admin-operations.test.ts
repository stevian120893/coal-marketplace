import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "../../lib/prisma";
import { hashSessionToken } from "../../lib/admin/session";
import { hashOfferToken } from "../../lib/offer-auth";
import { GET as buyersListGet, POST as buyersCreatePost } from "../../app/api/admin/buyers/route";
import {
  GET as buyerDetailGet,
  PATCH as buyerPatch,
} from "../../app/api/admin/buyers/[id]/route";
import { GET as listingsListGet, POST as listingsCreatePost } from "../../app/api/admin/listings/route";
import {
  GET as listingDetailGet,
  PATCH as listingPatch,
} from "../../app/api/admin/listings/[id]/route";
import { POST as accessLinksPost } from "../../app/api/admin/access-links/route";
import { GET as offerGet } from "../../app/api/offer/[token]/route";

/**
 * Integration tests for the final-MVP admin capabilities: buyer management
 * (role forced to BUYER), listing management (flexible specifications, media
 * URL references, explicit status lifecycle), and buyer-specific access links
 * (raw token handed to the admin exactly once, hash-only storage, valid links
 * never silently invalidated).
 *
 * Test rows carry fixed ops-flow-* ids and are removed in teardown; seed rows
 * are only read.
 */

const OPS_ADMIN_ID = "ops-flow-admin";
const OPS_BUYER_ID = "ops-flow-buyer";
const OPS_BUYER2_ID = "ops-flow-buyer2";
const OPS_LISTING_ID = "ops-flow-listing";
const OPS_DRAFT_LISTING_ID = "ops-flow-draft-listing";
const OPS_INACTIVE_ADMIN_ID = "ops-flow-inactive";

// A fixed origin so the generated link URL is deterministic in tests, and
// apiBaseUrl() short-circuits before touching headers().
process.env.APP_BASE_URL = "https://market-place.test";

const NO_PRICES_REGEX = /tokenHash|"offerPrice"|"price"|seller price|final price/i;

function adminApiRequest(cookieValue: string | undefined): NextRequest {
  const fake = {
    nextUrl: new URL("http://localhost/api/admin/buyers"),
    cookies: {
      get: (name: string) =>
        cookieValue === undefined ? undefined : { name, value: cookieValue },
    },
  };
  return fake as unknown as NextRequest;
}

function jsonRequest(
  cookieValue: string,
  json: () => Promise<unknown>,
): NextRequest {
  const fake = {
    nextUrl: new URL("http://localhost/api/admin/whatever"),
    cookies: {
      get: (name: string) => ({ name, value: cookieValue }),
    },
    json,
  };
  return fake as unknown as NextRequest;
}

function offerCtx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function setup() {
  await prisma.user.deleteMany({
    where: { email: { startsWith: "ops-flow" } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [OPS_ADMIN_ID, OPS_BUYER_ID, OPS_BUYER2_ID, OPS_INACTIVE_ADMIN_ID] } },
  });
  await prisma.coalListing.deleteMany({
    where: { title: { startsWith: "Ops Flow" } },
  });
  await prisma.coalListing.deleteMany({
    where: { id: { in: [OPS_LISTING_ID, OPS_DRAFT_LISTING_ID] } },
  });

  const admin = await prisma.user.create({
    data: {
      id: OPS_ADMIN_ID,
      email: "ops-admin@local.test",
      name: "Ops Admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  await prisma.user.create({
    data: {
      id: OPS_INACTIVE_ADMIN_ID,
      email: "ops-inactive@local.test",
      name: "Inactive Ops Admin",
      role: "ADMIN",
      status: "INACTIVE",
    },
  });

  const rawSession = randomBytes(32).toString("base64url");
  const inactiveRaw = `ops-inactive-${randomBytes(8).toString("hex")}`;
  await prisma.adminSession.create({
    data: {
      userId: admin.id,
      tokenHash: hashSessionToken(rawSession),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.adminSession.create({
    data: {
      userId: OPS_INACTIVE_ADMIN_ID,
      tokenHash: hashSessionToken(inactiveRaw),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { admin, rawSession, inactiveRaw };
}

async function teardown() {
  // API-created buyers and listings carry cuid ids, so teardown matches by the
  // unique email / title prefixes instead of fixture ids, and the fixed
  // admin fixture ids directly.
  await prisma.user.deleteMany({ where: { email: { startsWith: "ops-flow" } } });
  await prisma.user.deleteMany({
    where: { id: { in: [OPS_ADMIN_ID, OPS_INACTIVE_ADMIN_ID] } },
  });
  await prisma.coalListing.deleteMany({
    where: { title: { startsWith: "Ops Flow" } },
  });
  await prisma.coalListing.deleteMany({
    where: { id: { in: [OPS_LISTING_ID, OPS_DRAFT_LISTING_ID] } },
  });
}

async function countsSnapshot() {
  return {
    user: await prisma.user.count(),
    coalListing: await prisma.coalListing.count(),
    accessToken: await prisma.accessToken.count(),
    quoteRequest: await prisma.quoteRequest.count(),
    transaction: await prisma.transaction.count(),
    coalSpecification: await prisma.coalSpecification.count(),
    coalVideo: await prisma.coalVideo.count(),
    coalPhoto: await prisma.coalPhoto.count(),
    cOA: await prisma.cOA.count(),
    adminSession: await prisma.adminSession.count(),
  };
}

const BUYER_CREATE_PAYLOAD = () => ({
  companyName: "Ops Flow Buyer",
  name: "Buyer Person",
  phone: "+62 812 0000 0000",
  email: "ops-flow-buyer@local.test",
  status: "ACTIVE",
});

const LISTING_CREATE_PAYLOAD = {
  title: "Ops Flow Lot 5,000 kcal/kg",
  description: "Loaded at Banjarmasin.",
  category: "SPEC_COAL",
  coalType: "ASALAN",
  origin: "South Kalimantan",
  pricingMode: "NEGOTIABLE",
  quantity: 5000,
  specifications: [
    { name: "GAR", value: "5041", unit: "kcal/kg" },
    { name: "TM", value: "25", unit: "%" },
  ],
  photos: ["https://cdn.example.test/ops.jpg"],
  coas: ["https://cdn.example.test/ops-coa.pdf"],
  videos: ["https://cdn.example.test/ops.mp4"],
};

test("admin operations flow against the real database", async () => {
  const countsBefore = await countsSnapshot();
  const { rawSession, inactiveRaw } = await setup();

  let buyerId = "";

  try {
    await test("all admin routes require an admin session and reject inactive admins", async () => {
      for (const call of [
        () => buyersListGet(adminApiRequest(undefined)),
        () => listingsCreatePost(adminApiRequest(undefined)),
        () => accessLinksPost(adminApiRequest(undefined)),
      ]) {
        assert.equal((await call()).status, 401);
      }
      for (const call of [
        () => buyersListGet(adminApiRequest(inactiveRaw)),
        () => listingsCreatePost(jsonRequest(inactiveRaw, async () => ({}))),
        () => accessLinksPost(jsonRequest(inactiveRaw, async () => ({}))),
      ]) {
        assert.equal((await call()).status, 403);
      }
    });

    await test("POST /api/admin/buyers creates a BUYER and never an ADMIN", async () => {
      const response = await buyersCreatePost(
        jsonRequest(rawSession, async () => ({ ...BUYER_CREATE_PAYLOAD(), id: "spoofed" })),
      );
      assert.equal(response.status, 201);
      const body = (await response.json()) as {
        buyer: { id: string; role?: string; companyName: string; status: string };
      };
      buyerId = body.buyer.id;
      assert.equal(body.buyer.companyName, "Ops Flow Buyer");
      assert.equal(body.buyer.role, undefined, "the contract never echoes a role");

      const row = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
      assert.equal(row.role, "BUYER");
      // A client-supplied id is ignored: the created row has a cuid, not "spoofed".
      assert.notEqual(row.id, "spoofed");

      // An explicit ADMIN role in the body is rejected outright.
      const adminAttempt = await buyersCreatePost(
        jsonRequest(rawSession, async () => ({
          ...BUYER_CREATE_PAYLOAD(),
          email: "ops-flow-bad@local.test",
          role: "ADMIN",
        })),
      );
      assert.equal(adminAttempt.status, 400);
    });

    await test("POST /api/admin/buyers rejects malformed payloads and duplicate emails", async () => {
      for (const json of [
        async () => { throw new SyntaxError("bad json"); },
        async () => "text",
        async () => ({}),
      ]) {
        const response = await buyersCreatePost(jsonRequest(rawSession, json));
        assert.equal(response.status, 400);
      }

      const duplicate = await buyersCreatePost(
        jsonRequest(rawSession, async () => BUYER_CREATE_PAYLOAD()),
      );
      assert.equal(duplicate.status, 409);
      const body = (await duplicate.json()) as { error: string };
      assert.match(body.error, /email/i);
    });

    await test("GET /api/admin/buyers lists buyers without prices", async () => {
      const response = await buyersListGet(adminApiRequest(rawSession));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        buyers: { id: string; companyName: string; email: string; status: string }[];
        total: number;
      };
      const mine = body.buyers.find((buyer) => buyer.id === buyerId);
      assert.ok(mine !== undefined);
      assert.equal(mine.email, "ops-flow-buyer@local.test");
      assert.doesNotMatch(JSON.stringify(body), NO_PRICES_REGEX);
    });

    await test("GET /api/admin/buyers/[id] returns the profile with record counts", async () => {
      const response = await buyerDetailGet(adminApiRequest(rawSession), offerCtx(buyerId));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        buyer: {
          id: string;
          companyName: string;
          status: string;
          accessLinkCount: number;
          offerCount: number;
          transactionCount: number;
        };
      };
      assert.equal(body.buyer.id, buyerId);
      assert.equal(body.buyer.companyName, "Ops Flow Buyer");
      assert.equal(body.buyer.accessLinkCount, 0);
      assert.equal(body.buyer.offerCount, 0);
      assert.equal(body.buyer.transactionCount, 0);
      assert.doesNotMatch(JSON.stringify(body), NO_PRICES_REGEX);
    });

    await test("PATCH /api/admin/buyers/[id] edits identity and status but never the role", async () => {
      const response = await buyerPatch(
        jsonRequest(rawSession, async () => ({
          companyName: "Ops Flow Buyer (renamed)",
          name: "New Contact",
          phone: "+62 812 1111 1111",
          email: "ops-flow-buyer@local.test",
          status: "INACTIVE",
          role: "ADMIN",
        })),
        offerCtx(buyerId),
      );
      assert.equal(response.status, 400);

      const ok = await buyerPatch(
        jsonRequest(rawSession, async () => ({
          companyName: "Ops Flow Buyer (renamed)",
          name: "New Contact",
          phone: "+62 812 1111 1111",
          email: "ops-flow-buyer@local.test",
          status: "INACTIVE",
        })),
        offerCtx(buyerId),
      );
      assert.equal(ok.status, 200);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
      assert.equal(row.companyName, "Ops Flow Buyer (renamed)");
      assert.equal(row.status, "INACTIVE");
      assert.equal(row.role, "BUYER", "the role column is never touched by the buyer surface");
    });

    await test("POST /api/admin/listings creates a DRAFT with specs and media references", async () => {
      // No status in the payload: the server always starts new listings as DRAFT.
      const response = await listingsCreatePost(
        jsonRequest(rawSession, async () => LISTING_CREATE_PAYLOAD),
      );
      assert.equal(response.status, 201);
      const body = (await response.json()) as { listing: { id: string; status: string } };
      assert.equal(body.listing.status, "DRAFT");

      // A client that tries to publish through create is refused outright.
      const spoofed = await listingsCreatePost(
        jsonRequest(rawSession, async () => ({
          ...LISTING_CREATE_PAYLOAD,
          status: "PUBLISHED",
        })),
      );
      assert.equal(spoofed.status, 400, "publishing happens on the detail screen, never through create");

      const row = await prisma.coalListing.findUniqueOrThrow({
        where: { id: body.listing.id },
        include: { specifications: true, photos: true, coa: true, videos: true },
      });
      assert.equal(row.status, "DRAFT");
      assert.equal(row.title, "Ops Flow Lot 5,000 kcal/kg");
      assert.equal(row.quantity?.toString(), "5000");
      // All media and specifications land in their own tables.
      assert.deepEqual(
        row.specifications.map((s) => [s.name, s.value, s.unit]),
        [
          ["GAR", "5041", "kcal/kg"],
          ["TM", "25", "%"],
        ],
      );
      assert.deepEqual(row.photos.map((p) => p.fileUrl), ["https://cdn.example.test/ops.jpg"]);
      assert.deepEqual(row.coa.map((c) => c.fileUrl), ["https://cdn.example.test/ops-coa.pdf"]);
      assert.deepEqual(row.videos.map((v) => v.fileUrl), ["https://cdn.example.test/ops.mp4"]);
    });

    await test("POST /api/admin/listings rejects malformed media and specs", async () => {
      const notUrl = await listingsCreatePost(
        jsonRequest(rawSession, async () => ({
          ...LISTING_CREATE_PAYLOAD,
          photos: ["not-a-url"],
        })),
      );
      assert.equal(notUrl.status, 400);

      const dupSpec = await listingsCreatePost(
        jsonRequest(rawSession, async () => ({
          ...LISTING_CREATE_PAYLOAD,
          specifications: [
            { name: "GAR", value: "1" },
            { name: "gar", value: "2" },
          ],
        })),
      );
      assert.equal(dupSpec.status, 400);

      const badQuantity = await listingsCreatePost(
        jsonRequest(rawSession, async () => ({
          ...LISTING_CREATE_PAYLOAD,
          quantity: 472500.5555,
        })),
      );
      assert.equal(badQuantity.status, 400);
    });

    await test("GET /api/admin/listings lists all statuses with asset counts", async () => {
      const response = await listingsListGet(adminApiRequest(rawSession));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        listings: {
          id: string;
          status: string;
          specificationCount: number;
          photoCount: number;
          coaCount: number;
          videoCount: number;
        }[];
      };
      // The created draft row is present with its asset counts.
      const ops = body.listings.find(
        (l) => l.specificationCount === 2 && l.photoCount === 1 && l.coaCount === 1 && l.videoCount === 1,
      );
      assert.ok(ops !== undefined, "the created listing is listed with its counts");
      assert.equal(ops.status, "DRAFT");
    });

    await test("GET /api/admin/listings/[id] returns the full detail with merged specs", async () => {
      const listing = await prisma.coalListing.findFirstOrThrow({
        where: { title: "Ops Flow Lot 5,000 kcal/kg" },
      });
      const response = await listingDetailGet(adminApiRequest(rawSession), offerCtx(listing.id));
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        listing: {
          title: string;
          status: string;
          quantity: string | null;
          specifications: { name: string; value: string; unit: string | null }[];
          photos: string[];
          coas: string[];
          videos: string[];
        };
      };
      assert.equal(body.listing.status, "DRAFT");
      assert.equal(body.listing.quantity, "5000");
      assert.deepEqual(body.listing.specifications, [
        { name: "GAR", value: "5041", unit: "kcal/kg" },
        { name: "TM", value: "25", unit: "%" },
      ]);
      assert.deepEqual(body.listing.photos, ["https://cdn.example.test/ops.jpg"]);
      assert.deepEqual(body.listing.coas, ["https://cdn.example.test/ops-coa.pdf"]);
      assert.deepEqual(body.listing.videos, ["https://cdn.example.test/ops.mp4"]);
      assert.doesNotMatch(JSON.stringify(body), NO_PRICES_REGEX);
    });

    await test("PATCH replaces specs and media wholesale and updates basic info", async () => {
      const listing = await prisma.coalListing.findFirstOrThrow({
        where: { title: "Ops Flow Lot 5,000 kcal/kg" },
      });

      const response = await listingPatch(
        jsonRequest(rawSession, async () => ({
          title: "Ops Flow Lot 5,200 kcal/kg (updated)",
          description: null,
          category: "LOW_NO_SPEC",
          coalType: "FINE",
          typeLabel: null,
          origin: null,
          pricingMode: "FIXED",
          quantity: 4000,
          specifications: [
            { name: "GAR", value: "5200", unit: "kcal/kg" },
            { name: "Sulfur", value: "0.4", unit: "%" },
          ],
          photos: ["https://cdn.example.test/ops-v2.jpg"],
          coas: [],
          videos: [],
        })),
        offerCtx(listing.id),
      );
      assert.equal(response.status, 200);

      const row = await prisma.coalListing.findUniqueOrThrow({
        where: { id: listing.id },
        include: { specifications: true, photos: true, coa: true, videos: true },
      });
      assert.equal(row.title, "Ops Flow Lot 5,200 kcal/kg (updated)");
      assert.equal(row.category, "LOW_NO_SPEC");
      assert.equal(row.status, "DRAFT", "no status supplied -> unchanged");
      assert.deepEqual(
        row.specifications.map((s) => [s.name, s.value, s.unit]),
        [
          ["GAR", "5200", "kcal/kg"],
          ["Sulfur", "0.4", "%"],
        ],
      );
      assert.deepEqual(row.photos.map((p) => p.fileUrl), ["https://cdn.example.test/ops-v2.jpg"]);
      assert.equal(row.coa.length, 0, "COA rows are replaced wholesale, removed here");
      assert.equal(row.videos.length, 0);
    });

    await test("PATCH enforces the status lifecycle", async () => {
      const listing = await prisma.coalListing.findFirstOrThrow({
        where: { title: "Ops Flow Lot 5,200 kcal/kg (updated)" },
      });

      // Re-applying the current status is a conflict, and the status guard
      // rejects the whole PATCH before any write: the requested title change
      // must not persist alongside a refused status move.
      const sameState = await listingPatch(
        jsonRequest(rawSession, async () => ({
          status: "DRAFT",
          title: "Should not persist",
        })),
        offerCtx(listing.id),
      );
      assert.equal(sameState.status, 409);
      assert.equal(
        (await prisma.coalListing.findUniqueOrThrow({ where: { id: listing.id } })).title,
        "Ops Flow Lot 5,200 kcal/kg (updated)",
      );

      const publish = await listingPatch(
        jsonRequest(rawSession, async () => ({ status: "PUBLISHED" })),
        offerCtx(listing.id),
      );
      assert.equal(publish.status, 200);
      assert.equal(
        (await prisma.coalListing.findUniqueOrThrow({ where: { id: listing.id } })).status,
        "PUBLISHED",
      );

      // A second PUBLISHED application is one more same-state conflict.
      const republish = await listingPatch(
        jsonRequest(rawSession, async () => ({ status: "PUBLISHED" })),
        offerCtx(listing.id),
      );
      assert.equal(republish.status, 409);

      // SOLD is a valid move from PUBLISHED...
      const sell = await listingPatch(
        jsonRequest(rawSession, async () => ({ status: "SOLD" })),
        offerCtx(listing.id),
      );
      assert.equal(sell.status, 200);
      assert.equal(
        (await prisma.coalListing.findUniqueOrThrow({ where: { id: listing.id } })).status,
        "SOLD",
      );

      // ...and SOLD is terminal: nothing can leave it.
      const unsell = await listingPatch(
        jsonRequest(rawSession, async () => ({ status: "DRAFT" })),
        offerCtx(listing.id),
      );
      assert.equal(unsell.status, 409);

      const unknown = await listingPatch(
        jsonRequest(rawSession, async () => ({ status: "BOGUS" })),
        offerCtx(listing.id),
      );
      assert.equal(unknown.status, 400);

      const missing = await listingPatch(
        jsonRequest(rawSession, async () => ({ status: "PUBLISHED" })),
        offerCtx("does-not-exist"),
      );
      assert.equal(missing.status, 404);
    });

    await test("POST /api/admin/access-links mints a buyer-wide link, stores only the hash", async () => {
      // Buyer must be reactivated for the link issuance.
      const buyer = await prisma.user.update({
        where: { id: buyerId },
        data: { status: "ACTIVE" },
      });

      const response = await accessLinksPost(
        jsonRequest(rawSession, async () => ({
          userId: buyer.id,
        })),
      );
      assert.equal(response.status, 201);
      const body = (await response.json()) as {
        accessLink: {
          id: string;
          url: string;
          expiresAt: string;
          buyer: { id: string; companyName: string | null; name: string | null };
        };
      };
      // One link per buyer: https://<domain>/offer/<slug>-<secret>. No listing
      // is part of the link or the response. (The earlier buyer PATCH subtest
      // renamed this buyer, so the slug is derived from the current name.)
      assert.ok(
        body.accessLink.url.startsWith("https://market-place.test/offer/new-contact-"),
        "the URL carries the buyer slug and the raw secret",
      );
      assert.equal(body.accessLink.buyer.id, buyer.id);
      assert.equal(body.accessLink.buyer.companyName, "Ops Flow Buyer (renamed)");
      assert.equal(body.accessLink.buyer.name, "New Contact");
      assert.equal("coalListing" in body.accessLink, false);

      // The secret is the fixed-length tail of the link; the slug is cosmetic.
      const secret = body.accessLink.url.slice(-43);
      assert.match(secret, /^[A-Za-z0-9_-]{43}$/, "a full-size raw secret is handed to the admin");

      const stored = await prisma.accessToken.findUniqueOrThrow({
        where: { id: body.accessLink.id },
      });
      assert.equal(stored.tokenHash, hashOfferToken(secret));
      assert.notEqual(stored.tokenHash, secret);
      // Buyer-wide tokens omit the legacy listing reference entirely.
      assert.equal(stored.coalListingId, null);

      // The admin surface never discloses the hash, the session, or the password.
      const serialized = JSON.stringify(body);
      assert.doesNotMatch(serialized, /[a-f0-9]{64}/);
      assert.doesNotMatch(serialized, /tokenHash/);
      assert.doesNotMatch(serialized, /password/i);

      // The minted link (slug + secret) actually authenticates the buyer.
      const offer = await offerGet(
        new Request("http://localhost/api/offer/t"),
        { params: Promise.resolve({ token: body.accessLink.url.split("/offer/")[1] }) },
      );
      assert.equal(offer.status, 200);

      // Inactive buyers cannot be issued links; unknown buyers are 404; admins
      // (non-buyers) are rejected outright.
      await prisma.user.update({ where: { id: buyer.id }, data: { status: "INACTIVE" } });
      const inactive = await accessLinksPost(
        jsonRequest(rawSession, async () => ({
          userId: buyer.id,
        })),
      );
      assert.equal(inactive.status, 400);

      const unknownBuyer = await accessLinksPost(
        jsonRequest(rawSession, async () => ({
          userId: "does-not-exist",
        })),
      );
      assert.equal(unknownBuyer.status, 404);

      const notABuyer = await accessLinksPost(
        jsonRequest(rawSession, async () => ({
          userId: OPS_ADMIN_ID,
        })),
      );
      assert.equal(notABuyer.status, 400);
      const notABuyerBody = (await notABuyer.json()) as { error: string };
      assert.equal(
        notABuyerBody.error,
        "Tautan akses hanya dapat dibuat untuk pembeli.",
      );
    });

    await test("a second link for the same buyer never invalidates the first", async () => {
      const buyer = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
      // The previous subtest left the buyer INACTIVE to prove links refuse
      // inactive buyers; reactivate before minting more links.
      await prisma.user.update({
        where: { id: buyer.id },
        data: { status: "ACTIVE" },
      });

      const first = await accessLinksPost(
        jsonRequest(rawSession, async () => ({
          userId: buyer.id,
        })),
      );
      assert.equal(first.status, 201);
      const firstPath = ((await first.json()) as { accessLink: { url: string } }).accessLink.url.split("/offer/")[1];

      const second = await accessLinksPost(
        jsonRequest(rawSession, async () => ({
          userId: buyer.id,
        })),
      );
      assert.equal(second.status, 201);
      const secondPath = ((await second.json()) as { accessLink: { url: string } }).accessLink.url.split("/offer/")[1];
      assert.notEqual(firstPath, secondPath, "each generation mints a fresh secret");

      // Both links authenticate: issuing a new link must not revoke the old one.
      for (const path of [firstPath, secondPath]) {
        const offer = await offerGet(
          new Request("http://localhost/api/offer/t"),
          { params: Promise.resolve({ token: path }) },
        );
        assert.equal(offer.status, 200, "previously issued link stays valid");
      }

      const userTokens = await prisma.accessToken.findMany({
        where: { userId: buyer.id },
      });
      assert.ok(userTokens.length >= 2, "each minted token has its own stored hash row");
      assert.ok(
        userTokens.every((token) => token.coalListingId === null),
        "every new token is buyer-wide (no listing attached)",
      );
    });
  } finally {
    await teardown();
    const countsAfter = await countsSnapshot();
    assert.deepEqual(countsAfter, countsBefore, "test data must be fully removed");
  }
});