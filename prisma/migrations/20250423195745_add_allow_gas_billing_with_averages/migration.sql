/*
  Warnings:

  - You are about to drop the column `amenitiesRate` on the `Building` table. All the data in the column will be lost.
  - You are about to drop the column `backupGeneratorRate` on the `Building` table. All the data in the column will be lost.
  - You are about to drop the column `securityRate` on the `Building` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Building" DROP COLUMN "amenitiesRate",
DROP COLUMN "backupGeneratorRate",
DROP COLUMN "securityRate",
ADD COLUMN     "allowGasBillingWithAverages" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "amenitiesCharge" DOUBLE PRECISION,
ADD COLUMN     "backupGeneratorCharge" DOUBLE PRECISION,
ADD COLUMN     "securityCharge" DOUBLE PRECISION;
