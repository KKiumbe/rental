/*
  Warnings:

  - You are about to drop the column `rate` on the `GasConsumption` table. All the data in the column will be lost.
  - You are about to drop the column `rateDetails` on the `WaterConsumption` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "gasRate" DOUBLE PRECISION,
ADD COLUMN     "waterRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "GasConsumption" DROP COLUMN "rate";

-- AlterTable
ALTER TABLE "WaterConsumption" DROP COLUMN "rateDetails";
