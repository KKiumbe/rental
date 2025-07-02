/*
  Warnings:

  - Added the required column `invoiceType` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('RENT_PLUS', 'WATER');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceType" "InvoiceType" NOT NULL,
ADD COLUMN     "waterConsumptionId" TEXT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_waterConsumptionId_fkey" FOREIGN KEY ("waterConsumptionId") REFERENCES "WaterConsumption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
