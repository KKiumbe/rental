-- AlterEnum
ALTER TYPE "TenantStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
BEGIN;
CREATE TYPE "CustomerStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "Customer" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "status" TYPE "CustomerStatus_new" USING ("status"::text::"CustomerStatus_new");
ALTER TYPE "CustomerStatus" RENAME TO "CustomerStatus_old";
ALTER TYPE "CustomerStatus_new" RENAME TO "CustomerStatus";
DROP TYPE "CustomerStatus_old";
ALTER TABLE "Customer" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- DropForeignKey
ALTER TABLE "Deposit" DROP CONSTRAINT "Deposit_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Deposit" DROP CONSTRAINT "Deposit_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Deposit" DROP CONSTRAINT "Deposit_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_unitId_fkey";

-- DropForeignKey
ALTER TABLE "_BuildingToCustomer" DROP CONSTRAINT "_BuildingToCustomer_A_fkey";

-- DropForeignKey
ALTER TABLE "_BuildingToCustomer" DROP CONSTRAINT "_BuildingToCustomer_B_fkey";

-- DropIndex
DROP INDEX "CustomerUnit_customerId_unitId_isActive_key";

-- DropIndex
DROP INDEX "Customer_nationalId_key";

-- DropIndex
DROP INDEX "Customer_unitId_idx";

-- DropIndex
DROP INDEX "Customer_nationalId_idx";

-- DropIndex
DROP INDEX "Invoice_tenantId_idx";

-- DropIndex
DROP INDEX "Invoice_customerId_idx";

-- DropIndex
DROP INDEX "Invoice_unitId_idx";

-- DropIndex
DROP INDEX "Invoice_invoiceNumber_idx";

-- AlterTable
ALTER TABLE "UserActivity" DROP COLUMN "details";

-- AlterTable
ALTER TABLE "Building" DROP COLUMN "allowGasBillingWithAverages",
DROP COLUMN "allowWaterBillingWithAverages",
DROP COLUMN "billAmenities",
DROP COLUMN "billBackupGenerator",
DROP COLUMN "billGarbage",
DROP COLUMN "billGas",
DROP COLUMN "billSecurity",
DROP COLUMN "billServiceCharge",
DROP COLUMN "billWater";

-- AlterTable
ALTER TABLE "CustomerUnit" ALTER COLUMN "startDate" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "leaseEndDate",
DROP COLUMN "leaseFileUrl",
DROP COLUMN "leaseStartDate",
DROP COLUMN "nationalId",
ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "garbageCharge" DOUBLE PRECISION,
ADD COLUMN     "houseNumber" TEXT,
ADD COLUMN     "monthlyCharge" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "serviceCharge" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "unitId",
ALTER COLUMN "status" SET DEFAULT 'UNPAID',
ALTER COLUMN "isSystemGenerated" SET DEFAULT true,
ALTER COLUMN "createdBy" SET DEFAULT 'System';

-- DropTable
DROP TABLE "Deposit";

-- DropTable
DROP TABLE "_BuildingToCustomer";

-- DropEnum
DROP TYPE "DepositStatus";

-- CreateTable
CREATE TABLE "_InvoiceToUnit" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InvoiceToUnit_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_InvoiceToUnit_B_index" ON "_InvoiceToUnit"("B" ASC);

-- CreateIndex
CREATE INDEX "Building_name_idx" ON "Building"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUnit_customerId_unitId_key" ON "CustomerUnit"("customerId" ASC, "unitId" ASC);

-- CreateIndex
CREATE INDEX "Customer_buildingId_idx" ON "Customer"("buildingId" ASC);

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToUnit" ADD CONSTRAINT "_InvoiceToUnit_A_fkey" FOREIGN KEY ("A") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToUnit" ADD CONSTRAINT "_InvoiceToUnit_B_fkey" FOREIGN KEY ("B") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

