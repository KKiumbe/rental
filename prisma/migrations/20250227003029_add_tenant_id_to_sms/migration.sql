/*
  Warnings:

  - Added the required column `tenantId` to the `SMS` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SMS" ADD COLUMN     "tenantId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "SMS" ADD CONSTRAINT "SMS_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
