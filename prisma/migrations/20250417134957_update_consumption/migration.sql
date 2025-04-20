/*
  Warnings:

  - Added the required column `reading` to the `GasConsumption` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reading` to the `WaterConsumption` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WaterConsumption" ADD COLUMN "reading" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GasConsumption" ADD COLUMN "reading" INTEGER NOT NULL DEFAULT 0; 
