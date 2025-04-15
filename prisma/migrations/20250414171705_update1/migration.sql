/*
  Warnings:

  - You are about to drop the column `gasCharge` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyBaseRent` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `securityCharge` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `totalMonthlyCharge` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `waterCharge` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `baseRent` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `securityCharge` on the `Invoice` table. All the data in the column will be lost.
  - Added the required column `monthlyCharge` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monthlyCharge` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "gasCharge",
DROP COLUMN "monthlyBaseRent",
DROP COLUMN "securityCharge",
DROP COLUMN "totalMonthlyCharge",
DROP COLUMN "waterCharge",
ADD COLUMN     "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "garbageCharge" DOUBLE PRECISION,
ADD COLUMN     "monthlyCharge" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "secondaryPhoneNumber" TEXT;

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "baseRent",
DROP COLUMN "securityCharge",
ADD COLUMN     "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "garbageCharge" DOUBLE PRECISION,
ADD COLUMN     "monthlyCharge" DOUBLE PRECISION NOT NULL;

-- CreateTable
CREATE TABLE "GasConsumption" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "charge" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GasConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterConsumption" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL,
    "charge" DOUBLE PRECISION NOT NULL,
    "rateDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GasConsumption_customerId_period_idx" ON "GasConsumption"("customerId", "period");

-- CreateIndex
CREATE INDEX "WaterConsumption_customerId_period_idx" ON "WaterConsumption"("customerId", "period");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_phoneNumber_idx" ON "Customer"("phoneNumber");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- AddForeignKey
ALTER TABLE "GasConsumption" ADD CONSTRAINT "GasConsumption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterConsumption" ADD CONSTRAINT "WaterConsumption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
