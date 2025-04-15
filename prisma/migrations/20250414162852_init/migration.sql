/*
  Warnings:

  - The values [PPAID] on the enum `InvoiceStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `building` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `closingBalance` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `collected` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `county` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `estateName` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `gender` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyCharge` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `secondaryPhoneNumber` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `town` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `trashBagsIssued` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `closingBalance` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `invoiceAmount` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `isSystemGenerated` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `firstName` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `receiptId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `receipted` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `ref` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the `TrashBagIssuance` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `monthlyBaseRent` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalMonthlyCharge` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `baseRent` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `invoiceId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InvoiceStatus_new" AS ENUM ('UNPAID', 'PAID', 'PARTIALLY_PAID', 'CANCELLED');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantInvoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TenantInvoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "InvoiceStatus_old";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'UNPAID';
ALTER TABLE "TenantInvoice" ALTER COLUMN "status" SET DEFAULT 'UNPAID';
COMMIT;

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TrashBagIssuance" DROP CONSTRAINT "TrashBagIssuance_customerId_fkey";

-- DropForeignKey
ALTER TABLE "TrashBagIssuance" DROP CONSTRAINT "TrashBagIssuance_issuedById_fkey";

-- DropForeignKey
ALTER TABLE "TrashBagIssuance" DROP CONSTRAINT "TrashBagIssuance_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TrashBagIssuance" DROP CONSTRAINT "TrashBagIssuance_tenantId_fkey";

-- DropIndex
DROP INDEX "Customer_email_idx";

-- DropIndex
DROP INDEX "Customer_phoneNumber_idx";

-- DropIndex
DROP INDEX "Customer_status_idx";

-- DropIndex
DROP INDEX "Customer_tenantId_idx";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "building",
DROP COLUMN "category",
DROP COLUMN "closingBalance",
DROP COLUMN "collected",
DROP COLUMN "county",
DROP COLUMN "estateName",
DROP COLUMN "gender",
DROP COLUMN "location",
DROP COLUMN "monthlyCharge",
DROP COLUMN "secondaryPhoneNumber",
DROP COLUMN "town",
DROP COLUMN "trashBagsIssued",
ADD COLUMN     "gasCharge" DOUBLE PRECISION,
ADD COLUMN     "monthlyBaseRent" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "securityCharge" DOUBLE PRECISION,
ADD COLUMN     "serviceCharge" DOUBLE PRECISION,
ADD COLUMN     "totalMonthlyCharge" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "waterCharge" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "closingBalance",
DROP COLUMN "invoiceAmount",
DROP COLUMN "isSystemGenerated",
ADD COLUMN     "baseRent" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "gasCharge" DOUBLE PRECISION,
ADD COLUMN     "securityCharge" DOUBLE PRECISION,
ADD COLUMN     "serviceCharge" DOUBLE PRECISION,
ADD COLUMN     "totalAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "waterCharge" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "firstName",
DROP COLUMN "receiptId",
DROP COLUMN "receipted",
DROP COLUMN "ref",
ADD COLUMN     "customerId" TEXT NOT NULL,
ADD COLUMN     "invoiceId" TEXT NOT NULL,
ALTER COLUMN "transactionId" DROP NOT NULL;

-- DropTable
DROP TABLE "TrashBagIssuance";

-- CreateTable
CREATE TABLE "_CustomerToTaskAssignee" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CustomerToTaskAssignee_AB_unique" ON "_CustomerToTaskAssignee"("A", "B");

-- CreateIndex
CREATE INDEX "_CustomerToTaskAssignee_B_index" ON "_CustomerToTaskAssignee"("B");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerToTaskAssignee" ADD CONSTRAINT "_CustomerToTaskAssignee_A_fkey" FOREIGN KEY ("A") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerToTaskAssignee" ADD CONSTRAINT "_CustomerToTaskAssignee_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskAssignee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
