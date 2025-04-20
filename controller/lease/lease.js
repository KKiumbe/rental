// /Volumes/Software/rental/rentalAPI/controller/lease/lease.js
const { PrismaClient } = require("@prisma/client");
const { JsxFlags } = require("typescript");
const prisma = new PrismaClient();

// Helper to generate unique invoice number
const generateInvoiceNumber = () => {
  return `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
};

// Get lease termination progress
const getLeaseTerminationProgress = async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ error: "Unauthorized: Tenant ID not found" });
  }

  try {
    const progress = await prisma.leaseTermination.findFirst({
      where: { customerId: id, tenantId },
      include: { invoices: true },
    });
    res.json(progress || {});
  } catch (error) {
    console.error("Error fetching progress:", error);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
};

// Save lease termination progress
const saveLeaseTerminationProgress = async (req, res) => {
  const { id } = req.params;
  const { customerId, stage, terminationDate, reason, notes, media, damages, invoices } = req.body;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ error: "Unauthorized: Tenant ID not found" });
  }

  if (customerId !== id) {
    return res.status(400).json({ error: "Invalid customer ID" });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id, tenantId },
    });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const validStages = ["DETAILS", "MEDIA", "DAMAGES", "INVOICES", "VACATED"];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: "Invalid stage" });
    }

    // Find existing LeaseTermination record
    let progress = await prisma.leaseTermination.findFirst({
      where: { customerId: id, tenantId },
    });

    if (progress) {
      // Update existing record
      progress = await prisma.leaseTermination.update({
        where: { id: progress.id },
        data: {
          stage,
          terminationDate: terminationDate ? new Date(terminationDate) : null,
          reason: reason || null,
          notes: notes || null,
          media: media || [],
          damages: damages || [],
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new record
      progress = await prisma.leaseTermination.create({
        data: {
          customerId: id,
          tenantId,
          stage,
          terminationDate: terminationDate ? new Date(terminationDate) : null,
          reason: reason || null,
          notes: notes || null,
          media: media || [],
          damages: damages || [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    res.json(progress);
  } catch (error) {
    console.error("Error saving progress:", error);
    res.status(500).json({ error: "Failed to save progress" });
  }
};

// Upload media (photos/videos)
const uploadMedia = async (req, res) => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ error: "Unauthorized: Tenant ID not found" });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (error) {
    console.error("Error uploading media:", error);
    res.status(500).json({ error: error.message || "Failed to upload media" });
  }
};

// Create invoice for damages, deduct from deposit, allow PPAID if deposit is insufficient
const createInvoice = async (req, res) => {
  const { customerId, invoiceItems: inputInvoiceItems = [] } = req.body;

  console.log(`this is req , ${JSON.stringify(req.user)}`);
  const tenantId = req.user?.tenantId;
  const currentUser = req.user;

  // Validate tenant and user
  if (!tenantId || !currentUser) {
    return res.status(401).json({ error: "Unauthorized: Tenant ID or user not found" });
  }

  // Validate customerId and invoice items
  // if (!customerId || !inputInvoiceItems.length) {
  //   return res.status(400).json({ error: "Customer ID and invoice items are required" });
  // }

  // Validate invoice items
  for (const item of inputInvoiceItems) {
    if (!item.description || !item.amount || isNaN(item.amount) || parseFloat(item.amount) <= 0) {
      return res.status(400).json({ error: "Invalid description or amount in invoice items" });
    }
  }

  try {
    // Find customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      include: { unit: true },
    });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Find active deposit
    const deposit = await prisma.deposit.findFirst({
      where: { customerId, tenantId, status: "ACTIVE" },
    });
    if (!deposit) {
      return res.status(400).json({ error: "No active deposit found" });
    }

    // Calculate total invoice amount
    const invoiceAmount = inputInvoiceItems.reduce(
      (total, item) => total + parseFloat(item.amount) * (item.quantity || 1),
      0
    );

    const availableDeposit = deposit.amount;
    const isPartialPayment = availableDeposit < invoiceAmount;

    // Calculate invoice fields
    const amountPaid = isPartialPayment ? availableDeposit : invoiceAmount;
    const closingBalance = isPartialPayment ? invoiceAmount - availableDeposit : 0;
    const invoiceStatus = isPartialPayment ? "PPAID" : "PAID";

    const invoiceNumber = generateInvoiceNumber();

    // Create invoice and update deposit in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create invoice
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          customerId,
          unitId: customer.unitId || null,
          invoicePeriod: new Date(),
          invoiceNumber,
          invoiceAmount,
          amountPaid,
          status: invoiceStatus,
          closingBalance,
          isSystemGenerated: false,
          createdBy: `${currentUser.firstName} ${currentUser.lastName}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          InvoiceItem: {
            create: inputInvoiceItems.map((item) => ({
              description: item.description,
              amount: parseFloat(item.amount),
              quantity: item.quantity || 1,
            })),
          },
        },
      });

      // Update deposit
      const updatedDeposit = await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          amount: { decrement: amountPaid },
          deductionReason: `Deducted for invoice ${invoiceNumber}`,
          updatedAt: new Date(),
          status: isPartialPayment || deposit.amount - amountPaid <= 0 ? "FORFEITED" : "ACTIVE",
        },
      });

      return { invoice, updatedDeposit };
    });

    res.json(result.invoice);
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ error: "Failed to create invoice" });
  }
};

// Finalize lease termination
const finalizeLeaseTermination = async (req, res) => {
  const { id } = req.params;
  const { customerId, terminationDate, reason, notes, media, damages, invoices } = req.body;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ error: "Unauthorized: Tenant ID not found" });
  }

  if (customerId !== id) {
    return res.status(400).json({ error: "Invalid customer ID" });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id, tenantId },
      include: { unit: true },
    });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    if (customer.status !== "ACTIVE") {
      return res.status(400).json({ error: "Customer is not active" });
    }

    // Update lease termination, customer, and unit in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const termination = await tx.leaseTermination.findFirst({
        where: { customerId: id, tenantId },
      });

      let updatedTermination;
      if (termination) {
        updatedTermination = await tx.leaseTermination.update({
          where: { id: termination.id },
          data: {
            stage: "VACATED",
            terminationDate: terminationDate ? new Date(terminationDate) : null,
            reason: reason || null,
            notes: notes || null,
            media: media || [],
            damages: damages || [],
            vacatedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } else {
        updatedTermination = await tx.leaseTermination.create({
          data: {
            customerId: id,
            tenantId,
            stage: "VACATED",
            terminationDate: terminationDate ? new Date(terminationDate) : null,
            reason: reason || null,
            notes: notes || null,
            media: media || [],
            damages: damages || [],
            vacatedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      // Update customer status
      await tx.customer.update({
        where: { id },
        data: {
          status: "INACTIVE",
          leaseEndDate: terminationDate ? new Date(terminationDate) : new Date(),
          updatedAt: new Date(),
        },
      });

      // Update unit status if assigned
      if (customer.unitId) {
        await tx.unit.update({
          where: { id: customer.unitId },
          data: {
            status: "VACANT",
            updatedAt: new Date(),
          },
        });
      }

      // Mark any remaining active deposits as REFUNDED
      const activeDeposits = await tx.deposit.findMany({
        where: { customerId, tenantId, status: "ACTIVE" },
      });
      for (const deposit of activeDeposits) {
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            status: "REFUNDED",
            refundedAt: new Date(),
            refundAmount: deposit.amount,
            updatedAt: new Date(),
          },
        });
      }

      return updatedTermination;
    });

    res.json({ message: "Lease terminated successfully", termination: result });
  } catch (error) {
    console.error("Error terminating lease:", error);
    res.status(500).json({ error: "Failed to terminate lease" });
  }
};

module.exports = {
  getLeaseTerminationProgress,
  saveLeaseTerminationProgress,
  uploadMedia,
  createInvoice,
  finalizeLeaseTermination,
};