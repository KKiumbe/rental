-- CreateTable
CREATE TABLE "LeaseTermination" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "reason" TEXT,
    "notes" TEXT,
    "media" JSONB[],
    "damages" JSONB[],
    "vacatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseTermination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TerminationInvoices" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_TerminationInvoices_AB_unique" ON "_TerminationInvoices"("A", "B");

-- CreateIndex
CREATE INDEX "_TerminationInvoices_B_index" ON "_TerminationInvoices"("B");

-- AddForeignKey
ALTER TABLE "LeaseTermination" ADD CONSTRAINT "LeaseTermination_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTermination" ADD CONSTRAINT "LeaseTermination_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminationInvoices" ADD CONSTRAINT "_TerminationInvoices_A_fkey" FOREIGN KEY ("A") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminationInvoices" ADD CONSTRAINT "_TerminationInvoices_B_fkey" FOREIGN KEY ("B") REFERENCES "LeaseTermination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "todo";
