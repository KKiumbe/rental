/*
  Warnings:

  - Added the required column `tenantId` to the `GasConsumption` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `WaterConsumption` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GasConsumption" ADD COLUMN     "tenantId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "WaterConsumption" ADD COLUMN     "tenantId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "GasConsumption" ADD CONSTRAINT "GasConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterConsumption" ADD CONSTRAINT "WaterConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
