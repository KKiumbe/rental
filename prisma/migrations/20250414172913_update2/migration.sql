-- CreateEnum
CREATE TYPE "LandlordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "buildingId" TEXT;

-- CreateTable
CREATE TABLE "Landlord" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "status" "LandlordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Landlord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "landlordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "unitCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Landlord_email_key" ON "Landlord"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Landlord_phoneNumber_key" ON "Landlord"("phoneNumber");

-- CreateIndex
CREATE INDEX "Landlord_tenantId_idx" ON "Landlord"("tenantId");

-- CreateIndex
CREATE INDEX "Landlord_phoneNumber_idx" ON "Landlord"("phoneNumber");

-- CreateIndex
CREATE INDEX "Landlord_email_idx" ON "Landlord"("email");

-- CreateIndex
CREATE INDEX "Building_tenantId_idx" ON "Building"("tenantId");

-- CreateIndex
CREATE INDEX "Building_landlordId_idx" ON "Building"("landlordId");

-- CreateIndex
CREATE INDEX "Building_name_idx" ON "Building"("name");

-- CreateIndex
CREATE INDEX "Customer_buildingId_idx" ON "Customer"("buildingId");

-- AddForeignKey
ALTER TABLE "Landlord" ADD CONSTRAINT "Landlord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
