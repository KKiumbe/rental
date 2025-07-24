-- CreateEnum
CREATE TYPE "BuildingExpenseType" AS ENUM ('REPAIR', 'MAINTENANCE', 'RENOVATION', 'UTILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "BuildingExpense" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "buildingId" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "expenseType" "BuildingExpenseType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuildingExpense_tenantId_idx" ON "BuildingExpense"("tenantId");

-- CreateIndex
CREATE INDEX "BuildingExpense_buildingId_idx" ON "BuildingExpense"("buildingId");

-- CreateIndex
CREATE INDEX "BuildingExpense_landlordId_idx" ON "BuildingExpense"("landlordId");

-- AddForeignKey
ALTER TABLE "BuildingExpense" ADD CONSTRAINT "BuildingExpense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingExpense" ADD CONSTRAINT "BuildingExpense_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingExpense" ADD CONSTRAINT "BuildingExpense_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildingExpense" ADD CONSTRAINT "BuildingExpense_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
