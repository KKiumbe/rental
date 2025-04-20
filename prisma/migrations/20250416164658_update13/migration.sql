-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "leaseEndDate" TIMESTAMP(3),
ADD COLUMN     "leaseFileUrl" TEXT,
ADD COLUMN     "leaseStartDate" TIMESTAMP(3);
