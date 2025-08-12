/*
  Warnings:

  - You are about to drop the `_AbnormalWaterReadingToWaterConsumption` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_AbnormalWaterReadingToWaterConsumption" DROP CONSTRAINT "_AbnormalWaterReadingToWaterConsumption_A_fkey";

-- DropForeignKey
ALTER TABLE "_AbnormalWaterReadingToWaterConsumption" DROP CONSTRAINT "_AbnormalWaterReadingToWaterConsumption_B_fkey";

-- DropTable
DROP TABLE "_AbnormalWaterReadingToWaterConsumption";
