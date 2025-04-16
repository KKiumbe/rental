/*
  Warnings:

  - Added the required column `tenantId` to the `UserActivity` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserActivity" ADD COLUMN "tenantId" INTEGER NOT NULL DEFAULT 1;


-- AddForeignKey
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
