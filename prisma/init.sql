-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BUYER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SOLD');

-- CreateEnum
CREATE TYPE "CoalCategory" AS ENUM ('LOW_NO_SPEC', 'SPEC_COAL');

-- CreateEnum
CREATE TYPE "CoalType" AS ENUM ('ASALAN', 'FINE', 'LAMPI', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('NEGOTIABLE', 'FIXED');

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('PENDING', 'IN_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyName" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'BUYER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoalListing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "CoalCategory",
    "coalType" "CoalType",
    "typeLabel" TEXT,
    "origin" TEXT,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'NEGOTIABLE',
    "quantity" DECIMAL(12,3),
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gar" DECIMAL(6,2),
    "tm" DECIMAL(5,2),
    "ash" DECIMAL(5,2),
    "sulfur" DECIMAL(5,2),

    CONSTRAINT "CoalListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "COA" (
    "id" TEXT NOT NULL,
    "coalListingId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "COA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoalPhoto" (
    "id" TEXT NOT NULL,
    "coalListingId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoalPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoalVideo" (
    "id" TEXT NOT NULL,
    "coalListingId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoalVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coalListingId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coalListingId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "offerPrice" DECIMAL(14,2),
    "paymentTerms" TEXT,
    "notes" TEXT,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coalListingId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "paymentTerms" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_companyName_idx" ON "User"("companyName");

-- CreateIndex
CREATE INDEX "CoalListing_status_idx" ON "CoalListing"("status");

-- CreateIndex
CREATE INDEX "CoalListing_origin_idx" ON "CoalListing"("origin");

-- CreateIndex
CREATE INDEX "CoalListing_category_idx" ON "CoalListing"("category");

-- CreateIndex
CREATE INDEX "CoalListing_coalType_idx" ON "CoalListing"("coalType");

-- CreateIndex
CREATE INDEX "CoalListing_createdAt_idx" ON "CoalListing"("createdAt");

-- CreateIndex
CREATE INDEX "CoalSpecification_coalListingId_idx" ON "CoalSpecification"("coalListingId");

-- CreateIndex
CREATE INDEX "COA_coalListingId_idx" ON "COA"("coalListingId");

-- CreateIndex
CREATE INDEX "CoalPhoto_coalListingId_idx" ON "CoalPhoto"("coalListingId");

-- CreateIndex
CREATE INDEX "CoalVideo_coalListingId_idx" ON "CoalVideo"("coalListingId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_tokenHash_key" ON "AccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessToken_userId_idx" ON "AccessToken"("userId");

-- CreateIndex
CREATE INDEX "AccessToken_coalListingId_idx" ON "AccessToken"("coalListingId");

-- CreateIndex
CREATE INDEX "AccessToken_expiresAt_idx" ON "AccessToken"("expiresAt");

-- CreateIndex
CREATE INDEX "QuoteRequest_userId_idx" ON "QuoteRequest"("userId");

-- CreateIndex
CREATE INDEX "QuoteRequest_coalListingId_idx" ON "QuoteRequest"("coalListingId");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");

-- CreateIndex
CREATE INDEX "QuoteRequest_createdAt_idx" ON "QuoteRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_quoteRequestId_key" ON "Transaction"("quoteRequestId");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_coalListingId_idx" ON "Transaction"("coalListingId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- AddForeignKey
ALTER TABLE "CoalSpecification" ADD CONSTRAINT "CoalSpecification_coalListingId_fkey" FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "COA" ADD CONSTRAINT "COA_coalListingId_fkey" FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoalPhoto" ADD CONSTRAINT "CoalPhoto_coalListingId_fkey" FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoalVideo" ADD CONSTRAINT "CoalVideo_coalListingId_fkey" FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_coalListingId_fkey" FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_coalListingId_fkey" FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_coalListingId_fkey" FOREIGN KEY ("coalListingId") REFERENCES "CoalListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;