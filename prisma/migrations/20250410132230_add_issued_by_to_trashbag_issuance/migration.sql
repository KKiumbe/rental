-- AlterTable
ALTER TABLE "TrashBagIssuance" ADD COLUMN     "issuedById" INTEGER;

-- CreateIndex
CREATE INDEX "TrashBagIssuance_issuedById_idx" ON "TrashBagIssuance"("issuedById");

-- AddForeignKey
ALTER TABLE "TrashBagIssuance" ADD CONSTRAINT "TrashBagIssuance_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "TaskAssignee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
