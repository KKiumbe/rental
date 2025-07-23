/*
  Warnings:

  - The values [CREDIT_CARD,DEBIT_CARD] on the enum `ModeOfPayment` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ModeOfPayment_new" AS ENUM ('CASH', 'MPESA', 'BANK_TRANSFER');
ALTER TABLE "TenantPayment" ALTER COLUMN "modeOfPayment" TYPE "ModeOfPayment_new" USING ("modeOfPayment"::text::"ModeOfPayment_new");
ALTER TABLE "Payment" ALTER COLUMN "modeOfPayment" TYPE "ModeOfPayment_new" USING ("modeOfPayment"::text::"ModeOfPayment_new");
ALTER TABLE "Receipt" ALTER COLUMN "modeOfPayment" TYPE "ModeOfPayment_new" USING ("modeOfPayment"::text::"ModeOfPayment_new");
ALTER TYPE "ModeOfPayment" RENAME TO "ModeOfPayment_old";
ALTER TYPE "ModeOfPayment_new" RENAME TO "ModeOfPayment";
DROP TYPE "ModeOfPayment_old";
COMMIT;
