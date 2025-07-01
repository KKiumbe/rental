/*
  Warnings:

  - You are about to drop the `_CustomerToPayment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_CustomerToPayment" DROP CONSTRAINT "_CustomerToPayment_A_fkey";

-- DropForeignKey
ALTER TABLE "_CustomerToPayment" DROP CONSTRAINT "_CustomerToPayment_B_fkey";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "customerId" TEXT;

-- DropTable
DROP TABLE "_CustomerToPayment";

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
