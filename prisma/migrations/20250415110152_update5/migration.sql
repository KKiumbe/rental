-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdBy" TEXT NOT NULL DEFAULT 'System',
ADD COLUMN     "isSystemGenerated" BOOLEAN NOT NULL DEFAULT true;
