/*
  Warnings:

  - Added the required column `managementShare` to the `Building` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "UnitStatus" ADD VALUE 'OCCUPIED_PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "managementShare" DOUBLE PRECISION NOT NULL DEFAULT 0;
