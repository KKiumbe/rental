-- AlterEnum
ALTER TYPE "UnitStatus" ADD VALUE 'OCCUPIED_PENDING_PAYMENT';

-- DropIndex
DROP INDEX "Building_name_idx";
