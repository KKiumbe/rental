/*
  Warnings:

  - You are about to drop the column `buildingId` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `garbageCharge` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `houseNumber` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyCharge` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `serviceCharge` on the `Customer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[nationalId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('VACANT', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('ACTIVE', 'REFUNDED', 'FORFEITED');

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_buildingId_fkey";

-- DropIndex
DROP INDEX "Customer_buildingId_idx";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "buildingId",
DROP COLUMN "garbageCharge",
DROP COLUMN "houseNumber",
DROP COLUMN "monthlyCharge",
DROP COLUMN "serviceCharge",
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "unitId" TEXT;

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "monthlyCharge" DOUBLE PRECISION NOT NULL,
    "depositAmount" DOUBLE PRECISION NOT NULL,
    "garbageCharge" DOUBLE PRECISION,
    "serviceCharge" DOUBLE PRECISION,
    "status" "UnitStatus" NOT NULL DEFAULT 'VACANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "deductionReason" TEXT,
    "refundTransactionId" TEXT,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BuildingToCustomer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Unit_tenantId_idx" ON "Unit"("tenantId");

-- CreateIndex
CREATE INDEX "Unit_buildingId_idx" ON "Unit"("buildingId");

-- CreateIndex
CREATE INDEX "Unit_unitNumber_idx" ON "Unit"("unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_refundTransactionId_key" ON "Deposit"("refundTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "_BuildingToCustomer_AB_unique" ON "_BuildingToCustomer"("A", "B");

-- CreateIndex
CREATE INDEX "_BuildingToCustomer_B_index" ON "_BuildingToCustomer"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nationalId_key" ON "Customer"("nationalId");

-- CreateIndex
CREATE INDEX "Customer_unitId_idx" ON "Customer"("unitId");

-- CreateIndex
CREATE INDEX "Customer_nationalId_idx" ON "Customer"("nationalId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BuildingToCustomer" ADD CONSTRAINT "_BuildingToCustomer_A_fkey" FOREIGN KEY ("A") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BuildingToCustomer" ADD CONSTRAINT "_BuildingToCustomer_B_fkey" FOREIGN KEY ("B") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
