-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "amenitiesRate" DOUBLE PRECISION,
ADD COLUMN     "backupGeneratorRate" DOUBLE PRECISION,
ADD COLUMN     "billAmenities" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billBackupGenerator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billGarbage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billGas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billSecurity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billServiceCharge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billWater" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "securityRate" DOUBLE PRECISION;
