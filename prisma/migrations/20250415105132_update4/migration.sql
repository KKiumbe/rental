/*
  Warnings:

  - You are about to drop the column `garbageCharge` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `gasCharge` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyCharge` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `serviceCharge` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `waterCharge` on the `Invoice` table. All the data in the column will be lost.
  - Added the required column `invoiceAmount` to the `Invoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "garbageCharge",
DROP COLUMN "gasCharge",
DROP COLUMN "monthlyCharge",
DROP COLUMN "serviceCharge",
DROP COLUMN "totalAmount",
DROP COLUMN "waterCharge",
ADD COLUMN     "invoiceAmount" DOUBLE PRECISION NOT NULL;
