-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('FULL', 'WATER_ONLY');

-- CreateEnum
CREATE TYPE "AbnormalReviewAction" AS ENUM ('REQUEST_READING', 'DISCUSS_CONSUMPTION', 'METER_MAINTENANCE');

-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "billType" "BillType" NOT NULL DEFAULT 'FULL',
ADD COLUMN     "caretakerId" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "MPESAConfig" ADD COLUMN     "secretKey" TEXT NOT NULL DEFAULT 'uuid()';

-- AlterTable
ALTER TABLE "Unit" ALTER COLUMN "monthlyCharge" SET DEFAULT 0,
ALTER COLUMN "depositAmount" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "WaterConsumption" ADD COLUMN     "meterPhotoUrl" TEXT,
ADD COLUMN     "readById" INTEGER;

-- CreateTable
CREATE TABLE "AbnormalWaterReading" (
    "id" TEXT NOT NULL,
    "waterConsumptionId" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewNotes" TEXT,
    "action" "AbnormalReviewAction",
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbnormalWaterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AbnormalWaterReadingToCustomer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_merchantRequestId_key" ON "PaymentLink"("merchantRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_checkoutRequestId_key" ON "PaymentLink"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "PaymentLink_customerId_idx" ON "PaymentLink"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "_AbnormalWaterReadingToCustomer_AB_unique" ON "_AbnormalWaterReadingToCustomer"("A", "B");

-- CreateIndex
CREATE INDEX "_AbnormalWaterReadingToCustomer_B_index" ON "_AbnormalWaterReadingToCustomer"("B");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterConsumption" ADD CONSTRAINT "WaterConsumption_readById_fkey" FOREIGN KEY ("readById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalWaterReading" ADD CONSTRAINT "AbnormalWaterReading_waterConsumptionId_fkey" FOREIGN KEY ("waterConsumptionId") REFERENCES "WaterConsumption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalWaterReading" ADD CONSTRAINT "AbnormalWaterReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AbnormalWaterReadingToCustomer" ADD CONSTRAINT "_AbnormalWaterReadingToCustomer_A_fkey" FOREIGN KEY ("A") REFERENCES "AbnormalWaterReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AbnormalWaterReadingToCustomer" ADD CONSTRAINT "_AbnormalWaterReadingToCustomer_B_fkey" FOREIGN KEY ("B") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
