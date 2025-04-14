/*
  Warnings:

  - You are about to drop the column `issuedById` on the `TrashBagIssuance` table. All the data in the column will be lost.
  - You are about to drop the `GarbageCollection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GarbageCollection" DROP CONSTRAINT "GarbageCollection_collectedBy_fkey";

-- DropForeignKey
ALTER TABLE "GarbageCollection" DROP CONSTRAINT "GarbageCollection_customerId_fkey";

-- DropForeignKey
ALTER TABLE "GarbageCollection" DROP CONSTRAINT "GarbageCollection_taskId_fkey";

-- DropForeignKey
ALTER TABLE "GarbageCollection" DROP CONSTRAINT "GarbageCollection_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TrashBagIssuance" DROP CONSTRAINT "TrashBagIssuance_issuedById_fkey";

-- DropIndex
DROP INDEX "Customer_email_idx";

-- DropIndex
DROP INDEX "Customer_phoneNumber_idx";

-- DropIndex
DROP INDEX "Customer_status_idx";

-- DropIndex
DROP INDEX "Customer_tenantId_idx";

-- DropIndex
DROP INDEX "TrashBagIssuance_issuedById_idx";

-- AlterTable
ALTER TABLE "TrashBagIssuance" DROP COLUMN "issuedById";

-- DropTable
DROP TABLE "GarbageCollection";
