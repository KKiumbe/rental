/*
  Warnings:

  - You are about to drop the column `charge` on the `GasConsumption` table. All the data in the column will be lost.
  - You are about to drop the column `charge` on the `WaterConsumption` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GasConsumption" DROP COLUMN "charge";

-- AlterTable
ALTER TABLE "WaterConsumption" DROP COLUMN "charge";
