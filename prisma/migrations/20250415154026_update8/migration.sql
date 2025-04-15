/*
  Warnings:

  - You are about to drop the column `customerId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `invoiceId` on the `Payment` table. All the data in the column will be lost.
  - Made the column `transactionId` on table `Payment` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_tenantId_fkey";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "customerId",
DROP COLUMN "invoiceId",
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "receiptId" TEXT,
ADD COLUMN     "receipted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ref" TEXT,
ALTER COLUMN "transactionId" SET NOT NULL;

-- CreateTable
CREATE TABLE "_CustomerToPayment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_InvoiceToPayment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CustomerToPayment_AB_unique" ON "_CustomerToPayment"("A", "B");

-- CreateIndex
CREATE INDEX "_CustomerToPayment_B_index" ON "_CustomerToPayment"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_InvoiceToPayment_AB_unique" ON "_InvoiceToPayment"("A", "B");

-- CreateIndex
CREATE INDEX "_InvoiceToPayment_B_index" ON "_InvoiceToPayment"("B");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerToPayment" ADD CONSTRAINT "_CustomerToPayment_A_fkey" FOREIGN KEY ("A") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerToPayment" ADD CONSTRAINT "_CustomerToPayment_B_fkey" FOREIGN KEY ("B") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToPayment" ADD CONSTRAINT "_InvoiceToPayment_A_fkey" FOREIGN KEY ("A") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToPayment" ADD CONSTRAINT "_InvoiceToPayment_B_fkey" FOREIGN KEY ("B") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
