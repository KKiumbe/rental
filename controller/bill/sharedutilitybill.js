
const { PrismaClient, InvoiceStatus } = require('@prisma/client');
const prisma = new PrismaClient();

const { v4: uuidv4 } = require('uuid'); // Add this import at the top




const generateBuildingUtilityInvoices = async (req, res) => {
  const { tenantId, userId } = req.user;
  const { buildingId, amount, description, invoicePeriod, invoiceType } = req.body;

  console.log('Received generateBuildingUtilityInvoices request:', req.body);

  // Validate inputs
  if (!tenantId || !userId || !buildingId || !amount || !description || !invoicePeriod) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: buildingId, amount, description, and invoicePeriod are required',
    });
  }

  
try {
  // Convert invoicePeriod from MM/YYYY to Date
  const [month, year] = invoicePeriod.split('/');
  const invoicePeriodDate = new Date(`${year}-${month}-01`);

  if (isNaN(invoicePeriodDate.getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Invalid invoicePeriod format. Please use MM/YYYY format',
    });
  }

  // Continue processing...



    // Fetch active customers with their closing balance and CustomerUnit
    const activeCustomers = await prisma.customer.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        CustomerUnit: {
          some: {
            isActive: true,
            unit: {
              buildingId: buildingId,
            },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        closingBalance: true,
        CustomerUnit: {
          where: {
            isActive: true,
            unit: {
              buildingId: buildingId,
            },
          },
          include: {
            unit: {
              select: {
                id: true,
                unitNumber: true,
              },
            },
          },
        },
      },
    });

    if (activeCustomers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active customers found in this building',
      });
    }

    // Get building info for reference
    const building = await prisma.building.findUnique({
      where: { id: buildingId, tenantId },
    });

    if (!building) {
      return res.status(404).json({
        success: false,
        message: 'Building not found or does not belong to tenant',
      });
    }

    // Generate invoice number prefix using formatted date
    const periodString = invoicePeriodDate.toISOString().slice(0, 7).replace('-', '');
    const invoicePrefix = `${building.name.substring(0, 5).toUpperCase()}-${periodString}-`;

    // Create invoices in a transaction
    const createdInvoices = await prisma.$transaction(
      async (tx) => {
        const invoices = [];

        for (const customer of activeCustomers) {
          // Ensure CustomerUnit is an array
          const customerUnits = customer.CustomerUnit || [];

          if (customerUnits.length === 0) {
            console.warn(`No active CustomerUnit found for customer ${customer.id}`);
            continue; // Skip customers with no active units
          }

          // Track cumulative closing balance for this customer
          let cumulativeClosingBalance = customer.closingBalance;

             let status = 'UNPAID'; // Default status
          


          for (const cu of customerUnits) {
            const unitId = cu.unit.id;
            const unitNumber = cu.unit.unitNumber;

            // Generate a unique invoice number using customer ID and unit ID
            const uniqueSuffix = `${customer.id.slice(0, 8)}-${unitId.slice(0, 8)}`;
            const invoiceNumber = `${invoicePrefix}${uniqueSuffix}`;

            // Check if invoiceNumber already exists
            const existingInvoice = await tx.invoice.findUnique({
              where: { invoiceNumber },
            });

            if (existingInvoice) {
              throw new Error(`Invoice number ${invoiceNumber} already exists for this period`);
            }

            // Update cumulative closing balance for this invoice


            let status = InvoiceStatus.UNPAID;
let invoiceAmount = Number(amount);
let initialBalance = cumulativeClosingBalance;
let paidAmount = 0;

if (initialBalance < 0) {
  const overpayment = Math.abs(initialBalance);

  if (overpayment >= invoiceAmount) {
    status = InvoiceStatus.PAID;
    paidAmount = invoiceAmount;
    cumulativeClosingBalance += invoiceAmount;
  } else {
    status = InvoiceStatus.PPAID;
    paidAmount = overpayment;
    cumulativeClosingBalance += invoiceAmount;
  }
} else {
  status = InvoiceStatus.UNPAID; ;
  paidAmount = 0;
  cumulativeClosingBalance += invoiceAmount;
}


        




            const invoice = await tx.invoice.create({
              data: {
                id: uuidv4(),
                tenantId,
                customerId: customer.id,
                unitId,
                invoicePeriod: invoicePeriodDate,
                amountPaid: paidAmount,
                invoiceNumber,
                invoiceAmount: amount,
                status,
                closingBalance: cumulativeClosingBalance, // Use cumulative balance
                createdBy: `${req.user.firstName} ${req.user.lastName}`,
                isSystemGenerated: true,
                invoiceType: invoiceType || 'WATER',
                InvoiceItem: {
                  create: {
                    id: uuidv4(),
                    description: `${description} (Unit: ${unitNumber})`,
                    amount,
                    quantity: 1,
                  },
                },
              },
              include: {
                InvoiceItem: true,
                unit: {
                  select: {
                    id: true,
                    unitNumber: true,
                  },
                },
              },
            });

            // Create audit log
            await tx.auditLog.create({
              data: {
                id: uuidv4(),
                tenantId,
                userId: parseInt(userId),
                customerId: customer.id,
                action: 'CREATE',
                resource: 'INVOICE',
                description: `Generated utility invoice for ${customer.firstName} ${customer.lastName} - Unit ${unitNumber}`,
                details: {
                  invoiceNumber,
                  amount,
                  description,
                  buildingId,
                  buildingName: building.name,
                  unitNumber,
                  previousClosingBalance: customer.closingBalance,
                  newClosingBalance: cumulativeClosingBalance,
                },
                createdAt: new Date(),
              },
            });

            invoices.push(invoice);
          }

          // Update customer's closing balance once, after processing all units
          await tx.customer.update({
            where: { id: customer.id },
            data: { closingBalance: cumulativeClosingBalance },
          });
        }

        return invoices;
      },
      { timeout: 10000 } // 10-second timeout
    );

    return res.status(201).json({
      success: true,
      message: `Successfully generated ${createdInvoices.length} utility invoices for building ${building.name}`,
      data: {
        buildingId: building.id,
        buildingName: building.name,
        customerCount: createdInvoices.length,
        totalAmount: amount * createdInvoices.length,
        sampleInvoice: createdInvoices[0],
      },
    });
  } catch (error) {
    console.error('Error generating building utility invoices:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate utility invoices',
      error: error.message,
    });
  }
};
module.exports = {
  generateBuildingUtilityInvoices
};

