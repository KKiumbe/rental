/*
  Warnings:

  - You are about to drop the column `waterConsumptionId` on the `AbnormalWaterReading` table. All the data in the column will be lost.
  - You are about to drop the `_AbnormalWaterReadingToCustomer` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `consumption` to the `AbnormalWaterReading` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerId` to the `AbnormalWaterReading` table without a default value. This is not possible if the table is not empty.
  - Added the required column `period` to the `AbnormalWaterReading` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reading` to the `AbnormalWaterReading` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AbnormalWaterReading" DROP CONSTRAINT "AbnormalWaterReading_waterConsumptionId_fkey";

-- DropForeignKey
ALTER TABLE "_AbnormalWaterReadingToCustomer" DROP CONSTRAINT "_AbnormalWaterReadingToCustomer_A_fkey";

-- DropForeignKey
ALTER TABLE "_AbnormalWaterReadingToCustomer" DROP CONSTRAINT "_AbnormalWaterReadingToCustomer_B_fkey";

-- AlterTable
ALTER TABLE "AbnormalWaterReading" DROP COLUMN "waterConsumptionId",
ADD COLUMN     "consumption" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "customerId" TEXT NOT NULL,
ADD COLUMN     "meterPhotoUrl" TEXT,
ADD COLUMN     "period" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "readById" INTEGER,
ADD COLUMN     "reading" DOUBLE PRECISION NOT NULL;

-- DropTable
DROP TABLE "_AbnormalWaterReadingToCustomer";

-- CreateTable
CREATE TABLE "_AbnormalWaterReadingToWaterConsumption" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_AbnormalWaterReadingToWaterConsumption_AB_unique" ON "_AbnormalWaterReadingToWaterConsumption"("A", "B");

-- CreateIndex
CREATE INDEX "_AbnormalWaterReadingToWaterConsumption_B_index" ON "_AbnormalWaterReadingToWaterConsumption"("B");

-- AddForeignKey
ALTER TABLE "AbnormalWaterReading" ADD CONSTRAINT "AbnormalWaterReading_readById_fkey" FOREIGN KEY ("readById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalWaterReading" ADD CONSTRAINT "AbnormalWaterReading_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AbnormalWaterReadingToWaterConsumption" ADD CONSTRAINT "_AbnormalWaterReadingToWaterConsumption_A_fkey" FOREIGN KEY ("A") REFERENCES "AbnormalWaterReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AbnormalWaterReadingToWaterConsumption" ADD CONSTRAINT "_AbnormalWaterReadingToWaterConsumption_B_fkey" FOREIGN KEY ("B") REFERENCES "WaterConsumption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
