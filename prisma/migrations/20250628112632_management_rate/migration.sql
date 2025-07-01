/*
  Warnings:

  - You are about to drop the column `managementFee` on the `Building` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Building" DROP COLUMN "managementFee",
ADD COLUMN     "managementRate" DOUBLE PRECISION;
