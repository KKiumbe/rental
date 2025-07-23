-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "LandlordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('VACANT', 'OCCUPIED', 'MAINTENANCE', 'OCCUPIED_PENDING_PAYMENT');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('ACTIVE', 'REFUNDED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'PPAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModeOfPayment" AS ENUM ('CASH', 'MPESA', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('BAG_ISSUANCE', 'PAYMENT_COLLECTION', 'CUSTOMER_FEEDBACK', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AbnormalReviewAction" AS ENUM ('REQUEST_READING', 'DISCUSS_CONSUMPTION', 'METER_MAINTENANCE');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('FULL', 'WATER_ONLY');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('RENT_PLUS', 'WATER');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "subscriptionPlan" TEXT NOT NULL,
    "monthlyCharge" DOUBLE PRECISION NOT NULL,
    "paymentDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "alternativePhoneNumber" TEXT,
    "county" TEXT,
    "town" TEXT,
    "address" TEXT,
    "building" TEXT,
    "street" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "allowedUsers" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "invoicePeriod" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceAmount" DOUBLE PRECISION NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "TenantInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPayment" (
    "id" TEXT NOT NULL,
    "tenantInvoiceId" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "modeOfPayment" "ModeOfPayment" NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "gender" TEXT,
    "county" TEXT,
    "town" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT[],
    "customPermissions" JSONB,
    "createdBy" INTEGER,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3) NOT NULL,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "resetCode" TEXT,
    "resetCodeExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActivity" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    "customerId" TEXT,
    "details" JSONB,

    CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "details" JSONB,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SMSConfig" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "partnerId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "customerSupportPhoneNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SMSConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MPESAConfig" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "shortCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "passKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "secretKey" TEXT NOT NULL DEFAULT 'uuid()',

    CONSTRAINT "MPESAConfig_pkey" PRIMARY KEY ("id")
);

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
    "gasRate" DOUBLE PRECISION,
    "waterRate" DOUBLE PRECISION,
    "allowWaterBillingWithAverages" BOOLEAN NOT NULL DEFAULT false,
    "billAmenities" BOOLEAN NOT NULL DEFAULT false,
    "billBackupGenerator" BOOLEAN NOT NULL DEFAULT false,
    "billGarbage" BOOLEAN NOT NULL DEFAULT false,
    "billGas" BOOLEAN NOT NULL DEFAULT false,
    "billSecurity" BOOLEAN NOT NULL DEFAULT false,
    "billServiceCharge" BOOLEAN NOT NULL DEFAULT false,
    "billWater" BOOLEAN NOT NULL DEFAULT false,
    "allowGasBillingWithAverages" BOOLEAN NOT NULL DEFAULT false,
    "managementRate" DOUBLE PRECISION,
    "billType" "BillType" NOT NULL DEFAULT 'FULL',
    "caretakerId" INTEGER,
    "billPower" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUnit" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),

    CONSTRAINT "CustomerUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "monthlyCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "garbageCharge" DOUBLE PRECISION,
    "serviceCharge" DOUBLE PRECISION,
    "status" "UnitStatus" NOT NULL DEFAULT 'VACANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amenitiesCharge" DOUBLE PRECISION,
    "backupGeneratorCharge" DOUBLE PRECISION,
    "securityCharge" DOUBLE PRECISION,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "secondaryPhoneNumber" TEXT,
    "nationalId" TEXT,
    "unitId" TEXT,
    "leaseEndDate" TIMESTAMP(3),
    "leaseFileUrl" TEXT,
    "leaseStartDate" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" DOUBLE PRECISION,
    "deductionReason" TEXT,
    "refundTransactionId" TEXT,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GasConsumption" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reading" DOUBLE PRECISION NOT NULL,
    "tenantId" INTEGER NOT NULL,

    CONSTRAINT "GasConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterConsumption" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reading" DOUBLE PRECISION NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "meterPhotoUrl" TEXT,
    "readById" INTEGER,

    CONSTRAINT "WaterConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoicePeriod" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceAmount" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT NOT NULL,
    "isSystemGenerated" BOOLEAN NOT NULL,
    "unitId" TEXT,
    "invoiceType" "InvoiceType" NOT NULL,
    "waterConsumptionId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "modeOfPayment" "ModeOfPayment" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT,
    "receiptId" TEXT,
    "receipted" BOOLEAN NOT NULL DEFAULT false,
    "ref" TEXT,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "modeOfPayment" "ModeOfPayment" NOT NULL,
    "paidBy" TEXT,
    "transactionCode" TEXT,
    "phoneNumber" TEXT,
    "paymentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptInvoice" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,

    CONSTRAINT "ReceiptInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SMS" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clientsmsid" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SMS_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MPESATransactions" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "TransID" TEXT NOT NULL,
    "TransTime" TIMESTAMP(3) NOT NULL,
    "ShortCode" TEXT NOT NULL,
    "TransAmount" DOUBLE PRECISION NOT NULL,
    "BillRefNumber" TEXT NOT NULL,
    "MSISDN" TEXT NOT NULL,
    "FirstName" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MPESATransactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "declaredBags" INTEGER,
    "remainingBags" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "AbnormalWaterReading" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewNotes" TEXT,
    "action" "AbnormalReviewAction",
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL,
    "customerId" TEXT NOT NULL,
    "meterPhotoUrl" TEXT,
    "period" TIMESTAMP(3) NOT NULL,
    "readById" INTEGER,
    "reading" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AbnormalWaterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "merchantRequestId" TEXT,
    "checkoutRequestId" TEXT,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "powerConsumption" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "readById" INTEGER,
    "period" TIMESTAMP(3) NOT NULL,
    "reading" DOUBLE PRECISION NOT NULL,
    "consumption" DOUBLE PRECISION NOT NULL,
    "meterPhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "powerConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CreatedUsers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CreatedUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BuildingToCustomer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BuildingToCustomer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CustomerToTaskAssignee" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CustomerToTaskAssignee_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_InvoiceToPayment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InvoiceToPayment_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_InvoiceTopowerConsumption" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InvoiceTopowerConsumption_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TerminationInvoices" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TerminationInvoices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AbnormalWaterReadingToWaterConsumption" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AbnormalWaterReadingToWaterConsumption_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvoice_invoiceNumber_key" ON "TenantInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TenantPayment_transactionId_key" ON "TenantPayment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "UserActivity_tenantId_idx" ON "UserActivity"("tenantId");

-- CreateIndex
CREATE INDEX "UserActivity_userId_idx" ON "UserActivity"("userId");

-- CreateIndex
CREATE INDEX "UserActivity_customerId_idx" ON "UserActivity"("customerId");

-- CreateIndex
CREATE INDEX "AuditLog_customerId_idx" ON "AuditLog"("customerId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "SMSConfig_tenantId_key" ON "SMSConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MPESAConfig_tenantId_key" ON "MPESAConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MPESAConfig_shortCode_key" ON "MPESAConfig"("shortCode");

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
CREATE UNIQUE INDEX "CustomerUnit_customerId_unitId_isActive_key" ON "CustomerUnit"("customerId", "unitId", "isActive");

-- CreateIndex
CREATE INDEX "Unit_tenantId_idx" ON "Unit"("tenantId");

-- CreateIndex
CREATE INDEX "Unit_buildingId_idx" ON "Unit"("buildingId");

-- CreateIndex
CREATE INDEX "Unit_unitNumber_idx" ON "Unit"("unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON "Customer"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nationalId_key" ON "Customer"("nationalId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_unitId_idx" ON "Customer"("unitId");

-- CreateIndex
CREATE INDEX "Customer_phoneNumber_idx" ON "Customer"("phoneNumber");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_nationalId_idx" ON "Customer"("nationalId");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_refundTransactionId_key" ON "Deposit"("refundTransactionId");

-- CreateIndex
CREATE INDEX "GasConsumption_customerId_period_idx" ON "GasConsumption"("customerId", "period");

-- CreateIndex
CREATE INDEX "WaterConsumption_customerId_period_idx" ON "WaterConsumption"("customerId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_unitId_idx" ON "Invoice"("unitId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SMS_clientsmsid_key" ON "SMS"("clientsmsid");

-- CreateIndex
CREATE UNIQUE INDEX "MPESATransactions_TransID_key" ON "MPESATransactions"("TransID");

-- CreateIndex
CREATE INDEX "Task_tenantId_idx" ON "Task"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_assigneeId_key" ON "TaskAssignee"("taskId", "assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_merchantRequestId_key" ON "PaymentLink"("merchantRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_checkoutRequestId_key" ON "PaymentLink"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "PaymentLink_customerId_idx" ON "PaymentLink"("customerId");

-- CreateIndex
CREATE INDEX "powerConsumption_customerId_period_idx" ON "powerConsumption"("customerId", "period");

-- CreateIndex
CREATE INDEX "_CreatedUsers_B_index" ON "_CreatedUsers"("B");

-- CreateIndex
CREATE INDEX "_BuildingToCustomer_B_index" ON "_BuildingToCustomer"("B");

-- CreateIndex
CREATE INDEX "_CustomerToTaskAssignee_B_index" ON "_CustomerToTaskAssignee"("B");

-- CreateIndex
CREATE INDEX "_InvoiceToPayment_B_index" ON "_InvoiceToPayment"("B");

-- CreateIndex
CREATE INDEX "_InvoiceTopowerConsumption_B_index" ON "_InvoiceTopowerConsumption"("B");

-- CreateIndex
CREATE INDEX "_TerminationInvoices_B_index" ON "_TerminationInvoices"("B");

-- CreateIndex
CREATE INDEX "_AbnormalWaterReadingToWaterConsumption_B_index" ON "_AbnormalWaterReadingToWaterConsumption"("B");

-- AddForeignKey
ALTER TABLE "TenantInvoice" ADD CONSTRAINT "TenantInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPayment" ADD CONSTRAINT "TenantPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPayment" ADD CONSTRAINT "TenantPayment_tenantInvoiceId_fkey" FOREIGN KEY ("tenantInvoiceId") REFERENCES "TenantInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SMSConfig" ADD CONSTRAINT "SMSConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MPESAConfig" ADD CONSTRAINT "MPESAConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Landlord" ADD CONSTRAINT "Landlord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_caretakerId_fkey" FOREIGN KEY ("caretakerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUnit" ADD CONSTRAINT "CustomerUnit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUnit" ADD CONSTRAINT "CustomerUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GasConsumption" ADD CONSTRAINT "GasConsumption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GasConsumption" ADD CONSTRAINT "GasConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterConsumption" ADD CONSTRAINT "WaterConsumption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterConsumption" ADD CONSTRAINT "WaterConsumption_readById_fkey" FOREIGN KEY ("readById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterConsumption" ADD CONSTRAINT "WaterConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_waterConsumptionId_fkey" FOREIGN KEY ("waterConsumptionId") REFERENCES "WaterConsumption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptInvoice" ADD CONSTRAINT "ReceiptInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptInvoice" ADD CONSTRAINT "ReceiptInvoice_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SMS" ADD CONSTRAINT "SMS_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MPESATransactions" ADD CONSTRAINT "MPESATransactions_ShortCode_fkey" FOREIGN KEY ("ShortCode") REFERENCES "MPESAConfig"("shortCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MPESATransactions" ADD CONSTRAINT "MPESATransactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTermination" ADD CONSTRAINT "LeaseTermination_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTermination" ADD CONSTRAINT "LeaseTermination_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalWaterReading" ADD CONSTRAINT "AbnormalWaterReading_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalWaterReading" ADD CONSTRAINT "AbnormalWaterReading_readById_fkey" FOREIGN KEY ("readById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalWaterReading" ADD CONSTRAINT "AbnormalWaterReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "powerConsumption" ADD CONSTRAINT "powerConsumption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "powerConsumption" ADD CONSTRAINT "powerConsumption_readById_fkey" FOREIGN KEY ("readById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "powerConsumption" ADD CONSTRAINT "powerConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CreatedUsers" ADD CONSTRAINT "_CreatedUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CreatedUsers" ADD CONSTRAINT "_CreatedUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BuildingToCustomer" ADD CONSTRAINT "_BuildingToCustomer_A_fkey" FOREIGN KEY ("A") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BuildingToCustomer" ADD CONSTRAINT "_BuildingToCustomer_B_fkey" FOREIGN KEY ("B") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerToTaskAssignee" ADD CONSTRAINT "_CustomerToTaskAssignee_A_fkey" FOREIGN KEY ("A") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomerToTaskAssignee" ADD CONSTRAINT "_CustomerToTaskAssignee_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskAssignee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToPayment" ADD CONSTRAINT "_InvoiceToPayment_A_fkey" FOREIGN KEY ("A") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToPayment" ADD CONSTRAINT "_InvoiceToPayment_B_fkey" FOREIGN KEY ("B") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceTopowerConsumption" ADD CONSTRAINT "_InvoiceTopowerConsumption_A_fkey" FOREIGN KEY ("A") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceTopowerConsumption" ADD CONSTRAINT "_InvoiceTopowerConsumption_B_fkey" FOREIGN KEY ("B") REFERENCES "powerConsumption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminationInvoices" ADD CONSTRAINT "_TerminationInvoices_A_fkey" FOREIGN KEY ("A") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TerminationInvoices" ADD CONSTRAINT "_TerminationInvoices_B_fkey" FOREIGN KEY ("B") REFERENCES "LeaseTermination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AbnormalWaterReadingToWaterConsumption" ADD CONSTRAINT "_AbnormalWaterReadingToWaterConsumption_A_fkey" FOREIGN KEY ("A") REFERENCES "AbnormalWaterReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AbnormalWaterReadingToWaterConsumption" ADD CONSTRAINT "_AbnormalWaterReadingToWaterConsumption_B_fkey" FOREIGN KEY ("B") REFERENCES "WaterConsumption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
