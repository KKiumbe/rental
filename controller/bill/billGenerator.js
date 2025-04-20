const { PrismaClient, InvoiceStatus,CustomerStatus } = require('@prisma/client');
const { json } = require('express');
//const { GarbageCollectionDay } = require('./enum.js'); // Adjust the path if needed

const schedule = require('node-schedule'); // For scheduling jobs

const prisma = new PrismaClient();

// Function to generate a unique invoice number
function generateInvoiceNumber(customerId) {
  const invoiceSuffix = Math.floor(Math.random() * 1000000).toString().padStart(3, '0');
  return `INV${invoiceSuffix}-${customerId}`;
}

// Fetch the customer's current closing balance
async function getCurrentClosingBalance(customerId) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error(`Customer with ID ${customerId} not found.`);
    return customer.closingBalance;
  } catch (error) {
    console.error('Error fetching closing balance:', error);
    throw error;
  }
}

// Get the current month's bill (monthly charge)
async function getCurrentMonthBill(customerId) {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    return customer ? customer.monthlyCharge : 0;
  } catch (error) {
    console.error('Error fetching current month bill:', error);
    throw error;
  }
}



async function generateInvoicesForAll(req, res) {
  const { tenantId, user: userId } = req.user; // Include userId for UserActivity
  const now = new Date();
  const year = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  try {
    console.time('Find Customers');
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId: tenantId,
      },
      include: {
        unit: {
          include: {
            building: {
              select: {
                id: true,
                gasRate: true,
                waterRate: true,
              },
            },
          },
        },
      },
    });
    console.timeEnd('Find Customers');
    console.log(`Found ${customers.length} active customers for tenant ${tenantId}.`);

    // Fetch latest consumption records for all customers
    const customerIds = customers.map((c) => c.id);
    console.time('Fetch Consumptions');
    const gasConsumptions = await prisma.gasConsumption.findMany({
      where: {
        customerId: { in: customerIds },
      },
      orderBy: { period: 'desc' },
      select: {
        customerId: true,
        period: true,
        consumption: true,
      },
    });

    const waterConsumptions = await prisma.waterConsumption.findMany({
      where: {
        customerId: { in: customerIds },
      },
      orderBy: { period: 'desc' },
      select: {
        customerId: true,
        period: true,
        consumption: true,
      },
    });
    console.timeEnd('Fetch Consumptions');

    // Map consumptions to customers
    const customerData = customers.map((customer) => ({
      ...customer,
      gasConsumption: gasConsumptions.find(
        (gc) => gc.customerId === customer.id
      ),
      waterConsumption: waterConsumptions.find(
        (wc) => wc.customerId === customer.id
      ),
    }));

    const allInvoices = await processCustomerBatchForAll(customerData, currentMonth, year, userId);

    console.log(`Generated ${allInvoices.length} invoices, added items, and updated customer balances for tenant ${tenantId}.`);

    res.status(200).json({
      success: true,
      count: allInvoices.length,
      invoices: allInvoices,
    });
  } catch (error) {
    console.error(`Error generating invoices for tenant ${tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoices and update balances',
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function processCustomerBatchForAll(customers, currentMonth, year, userId) {
  const invoices = [];
  const invoiceItems = [];
  const customerUpdates = [];
  const userActivities = [];
  const invoicePeriod = new Date(year, currentMonth - 1, 1); // Previous month, aligning with invoiceCreate

  for (const customer of customers) {
    // Validate unit
    if (!customer.unitId || !customer.unit) {
      console.warn(`Skipping customer ${customer.id}: No unit assigned.`);
      continue;
    }

    // Validate building rates
    if (customer.unit.building.gasRate === null || customer.unit.building.waterRate === null) {
      console.warn(`Skipping customer ${customer.id}: Gas or water rate not defined.`);
      continue;
    }

    // Optional: Check for existing invoice (commented out as in your code)
    /*
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        customerId: customer.id,
        invoicePeriod,
      },
    });
    if (existingInvoice) {
      console.warn(`Skipping customer ${customer.id}: Invoice already exists for period ${invoicePeriod}.`);
      continue;
    }
    */

    // Build invoice items
    const items = [];

    // Monthly Charge
    if (customer.unit.monthlyCharge > 0) {
      items.push({
        description: 'Monthly Rent',
        amount: parseFloat(customer.unit.monthlyCharge.toFixed(2)),
        quantity: 1,
      });
    }

    // Garbage Charge
    if (customer.unit.garbageCharge && customer.unit.garbageCharge > 0) {
      items.push({
        description: 'Garbage Collection',
        amount: parseFloat(customer.unit.garbageCharge.toFixed(2)),
        quantity: 1,
      });
    }

    // Service Charge
    if (customer.unit.serviceCharge && customer.unit.serviceCharge > 0) {
      items.push({
        description: 'Service Fee',
        amount: parseFloat(customer.unit.serviceCharge.toFixed(2)),
        quantity: 1,
      });
    }

    // Gas Charge
    if (
      customer.gasConsumption &&
      customer.gasConsumption.consumption > 0 &&
      customer.gasConsumption.period.getTime() === invoicePeriod.getTime()
    ) {
      items.push({
        description: `Gas Consumption (${customer.gasConsumption.consumption} cubic meters)`,
        amount: parseFloat(customer.unit.building.gasRate.toFixed(2)),
        quantity: parseInt(customer.gasConsumption.consumption),
      });
    }

    // Water Charge
    if (
      customer.waterConsumption &&
      customer.waterConsumption.consumption > 0 &&
      customer.waterConsumption.period.getTime() === invoicePeriod.getTime()
    ) {
      items.push({
        description: `Water Consumption (${customer.waterConsumption.consumption} liters)`,
        amount: parseFloat(customer.unit.building.waterRate.toFixed(2)),
        quantity: parseInt(customer.waterConsumption.consumption),
      });
    }

    // Skip if no items
    if (items.length === 0) {
      console.warn(`Skipping customer ${customer.id}: No billable items.`);
      continue;
    }

    // Calculate invoice amount
    const invoiceAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    const invoiceNumber = generateInvoiceNumber(customer.id);
    const currentClosingBalance = customer.closingBalance ?? 0;
    let newClosingBalance = currentClosingBalance + invoiceAmount;
    let status = InvoiceStatus.UNPAID;
    let amountPaid = 0;

    // Handle credits
    if (currentClosingBalance < 0) {
      const availableCredit = Math.abs(currentClosingBalance);
      if (availableCredit >= invoiceAmount) {
        status = InvoiceStatus.PAID;
        amountPaid = invoiceAmount;
        newClosingBalance = currentClosingBalance + invoiceAmount;
      } else {
        status = InvoiceStatus.PARTIALLY_PAID; // Fixed PPAID to PARTIALLY_PAID
        amountPaid = availableCredit;
        newClosingBalance = currentClosingBalance + invoiceAmount;
      }
    }

    const invoice = {
      tenantId: customer.tenantId,
      customerId: customer.id,
      unitId: customer.unitId,
      invoicePeriod,
      invoiceNumber,
      invoiceAmount: parseFloat(invoiceAmount.toFixed(2)),
      closingBalance: parseFloat(newClosingBalance.toFixed(2)),
      status,
      isSystemGenerated: true,
      createdBy: 'System',
      createdAt: new Date(),
      amountPaid: parseFloat(amountPaid.toFixed(2)),
    };

    invoices.push(invoice);

    items.forEach((item) => {
      invoiceItems.push({
        invoiceNumber, // Temporary to map later
        description: item.description,
        amount: item.amount,
        quantity: item.quantity,
      });
    });

    customerUpdates.push({
      where: { id: customer.id },
      data: { closingBalance: parseFloat(newClosingBalance.toFixed(2)) },
    });

    userActivities.push({
      userId,
      tenantId: customer.tenantId,
      action: `Created invoice ${invoiceNumber} for customer ${customer.id} by System`,
      timestamp: new Date(),
    });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Bulk create invoices
        await tx.invoice.createMany({
          data: invoices,
          skipDuplicates: true,
        });

        // Fetch created invoices
        const fetchedInvoices = await tx.invoice.findMany({
          where: { invoiceNumber: { in: invoices.map((i) => i.invoiceNumber) } },
          select: { id: true, invoiceNumber: true },
        });

        // Map invoice items to invoice IDs
        const updatedInvoiceItems = invoiceItems.map((item) => ({
          invoiceId: fetchedInvoices.find((i) => i.invoiceNumber === item.invoiceNumber).id,
          description: item.description,
          amount: item.amount,
          quantity: item.quantity,
        }));

        // Bulk create invoice items
        await tx.invoiceItem.createMany({
          data: updatedInvoiceItems,
        });

        // Bulk update customers
        await Promise.all(customerUpdates.map((update) => tx.customer.update(update)));

        // Bulk create user activities
        await tx.userActivity.createMany({
          data: userActivities,
        });

        return fetchedInvoices;
      },
      { timeout: 30000 } // Increased timeout for large batches
    );

    return result;
  } catch (error) {
    console.error('Error in transaction (invoices, items, customers, user activities):', error);
    throw error;
  }
}

















// Function to process a single batch of customers
async function processCustomerBatch(customers, tenantId, currentMonth) {
  const invoices = [];

  for (const customer of customers) {
    try {
      const invoiceNumber = generateInvoiceNumber(customer.id);
      const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);
      const currentClosingBalance = await getCurrentClosingBalance(customer.id);
      const currentMonthBill = await getCurrentMonthBill(customer.id);
      const invoiceAmount = currentMonthBill;

      // Determine the status of the invoice based on the current closing balance
      let status = InvoiceStatus.UNPAID; // Default status
      const newClosingBalance = currentClosingBalance + invoiceAmount;

      if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
        status = InvoiceStatus.PAID;
      } else if (newClosingBalance === 0) {
        status = InvoiceStatus.PAID;
      } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
        status = InvoiceStatus.PAID;
      }

      // Create the new invoice
      const newInvoice = await prisma.invoice.create({
        data: {
          customerId: customer.id,
          tenantId,
          invoiceNumber,
          invoicePeriod,
          closingBalance: newClosingBalance,
          invoiceAmount,
          status,
          isSystemGenerated: true,
        },
      });

      // Create invoice item only if invoice amount is greater than zero
      if (invoiceAmount > 0) {
        await prisma.invoiceItem.create({
          data: {
            invoiceId: newInvoice.id,
            description: 'Monthly Charge',
            amount: invoiceAmount,
            quantity: 1,
          },
        });
      }

      // Update the customer’s closing balance
      await prisma.customer.update({
        where: { id: customer.id },
        data: { closingBalance: newClosingBalance },
      });

      invoices.push(newInvoice);
    } catch (error) {
      console.error(`Error processing customer ${customer.id}:`, error);
    }
  }

  return invoices;
}


async function processCustomerBatchforAll(customers, currentMonth) {
  const invoices = [];

  for (const customer of customers) {
    try {
      const invoiceNumber = generateInvoiceNumber(customer.id);
      const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);
      const currentClosingBalance = await getCurrentClosingBalance(customer.id);
      const currentMonthBill = await getCurrentMonthBill(customer.id);
      const invoiceAmount = currentMonthBill;

      // Determine the status of the invoice based on the current closing balance
      let status = InvoiceStatus.UNPAID; // Default status
      const newClosingBalance = currentClosingBalance + invoiceAmount;

      if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
        status = InvoiceStatus.PAID;
      } else if (newClosingBalance === 0) {
        status = InvoiceStatus.PAID;
      } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
        status = InvoiceStatus.PPAID;
      }

      // Create the new invoice
     

      const newInvoice = await prisma.invoice.create({
        data: {
          customer: {
            connect: { id: customer.id }, // Ensure relation mapping
          },
          tenant: {
            connect: { id: customer.tenantId }, // Ensure relation mapping
          },
          invoiceNumber,
          invoicePeriod,
          closingBalance: newClosingBalance,
          invoiceAmount,
          status,
          isSystemGenerated: true,
        },
      });
      

      // Create invoice item only if invoice amount is greater than zero
      if (invoiceAmount > 0) {
        await prisma.invoiceItem.create({
          data: {
            invoiceId: newInvoice.id,
            description: 'Monthly Charge',
            amount: invoiceAmount,
            quantity: 1,
          },
        });
      }

      // Update the customer’s closing balance
      await prisma.customer.update({
        where: { id: customer.id },
        data: { closingBalance: newClosingBalance },
      });

      invoices.push(newInvoice);
    } catch (error) {
      console.error(`Error processing customer ${customer.id}:`, error);
    }
  }

  return invoices;
}











async function generateInvoices(req, res) {
  const tenantId = req.user?.tenantId; // Extract tenantId from the authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required' });
  }

  const currentMonth = new Date().getMonth() + 1;

  try {
    console.time('Find Customers');
    const customers = await prisma.customer.findMany({
      where: { tenantId, status: 'ACTIVE' },
    });
    console.timeEnd('Find Customers');
    console.log(`Found ${customers.length} active customers.`);

    // Process customers in batches
    const batchSize = 20; // Number of customers to process per batch
    const totalBatches = Math.ceil(customers.length / batchSize);
    let allInvoices = [];

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = start + batchSize;
      const batch = customers.slice(start, end);

      console.log(`Processing batch ${i + 1} of ${totalBatches}...`);
      const batchInvoices = await processCustomerBatch(batch, tenantId, currentMonth);
      allInvoices = allInvoices.concat(batchInvoices);
    }

    console.log(`Generated ${allInvoices.length} invoices.`);
    return res.status(200).json({ message: 'Invoices generated successfully', data: allInvoices });
  } catch (error) {
    console.error('Error generating invoices:', error);
    return res.status(500).json({ message: 'Failed to generate invoices', error: error.message });
  }
}






async function generateInvoicesPerTenant(req, res) {
  const { tenantId } = req.body; // Extract tenantId from request body

  // Validate tenantId
  if (!tenantId || isNaN(tenantId)) {
    return res.status(400).json({ message: 'Valid Tenant ID is required in request body' });
  }

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();
  //const invoicePeriod = new Date(currentYear, currentMonth - 1, 1); // First of the month

 

  try {
    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: parseInt(tenantId) },
    });

    if (!tenant) {
      return res.status(404).json({ message: `Tenant with ID ${tenantId} not found` });
    }

    console.time('Find Customers');
    const customers = await prisma.customer.findMany({
      where: {
        tenantId: parseInt(tenantId), // Ensure integer for Prisma
        status: 'ACTIVE', // Only active customers
      },
    });
    console.timeEnd('Find Customers');
    console.log(`Found ${customers.length} active customers for tenant ${tenantId}.`);

    if (customers.length === 0) {
      return res.status(200).json({ message: `No active customers found for tenant ${tenantId}`, data: [] });
    }

    // Process customers in batches
    const batchSize = 20; // Number of customers to process per batch
    const totalBatches = Math.ceil(customers.length / batchSize);
    let allInvoices = [];

    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, customers.length);
      const batch = customers.slice(start, end);

      console.log(`Processing batch ${i + 1} of ${totalBatches} (${batch.length} customers) for tenant ${tenantId}...`);
      console.time(`Batch ${i + 1}`);
      const batchInvoices = await processCustomerBatch(batch, parseInt(tenantId), currentMonth);
      console.timeEnd(`Batch ${i + 1}`);
      allInvoices = allInvoices.concat(batchInvoices);
    }

    console.log(`Generated ${allInvoices.length} invoices for tenant ${tenantId}.`);
    return res.status(200).json({
      message: 'Invoices generated successfully',
      data: allInvoices,
    });
  } catch (error) {
    console.error(`Error generating invoices for tenant ${tenantId}:`, error);
    return res.status(500).json({ message: 'Failed to generate invoices', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}









// Controller function to handle invoice generation based on collection day
const generateInvoicesByDay = async (req, res) => {
  const { collectionDay } = req.body;



  try {
    // Call helper function to generate invoices
    const invoices = await generateInvoicesForDay(collectionDay);
    res.status(200).json({ message: "Invoices generated successfully", invoices });
  } catch (error) {
    console.error("Error generating invoices:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Helper function to generate invoices for a specific collection day
const generateInvoicesForDay = async (day) => {
  const currentMonth = new Date().getMonth() + 1;


    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        garbageCollectionDay:day
      }
    });

    const invoices = await Promise.all(
      customers.map(async (customer) => {
        const invoiceNumber = generateInvoiceNumber(customer.id);
        const invoicePeriod = new Date(new Date().getFullYear(), currentMonth - 1, 1);
        const currentClosingBalance = await getCurrentClosingBalance(customer.id);
        const currentMonthBill = await getCurrentMonthBill(customer.id);
        const invoiceAmount = currentMonthBill;

        let status = InvoiceStatus.UNPAID; // Default status
        const newClosingBalance = currentClosingBalance + invoiceAmount;

        if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
          status = InvoiceStatus.PAID;
        } else if (newClosingBalance === 0) {
          status = InvoiceStatus.PAID;
        } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
          status = InvoiceStatus.PPAID;
        } else {
          status = InvoiceStatus.UNPAID;
        }

        const newInvoice = await prisma.invoice.create({
          data: {
            customerId: customer.id,
            invoiceNumber,
            invoicePeriod,
            closingBalance: newClosingBalance,
            invoiceAmount,
            status,
            isSystemGenerated: true,
          },
        });

        if (invoiceAmount > 0) {
          await prisma.invoiceItem.create({
            data: {
              invoiceId: newInvoice.id,
              description: 'Monthly Charge',
              amount: invoiceAmount,
              quantity: 1,
            },
          });
        }

        await prisma.customer.update({
          where: { id: customer.id },
          data: { closingBalance: newClosingBalance },
        });

        return newInvoice;
      })
    );

 
};









const createInitialInvoice = async (req, res) => {
  const { tenantId, user } = req.user;
  const { customerId, invoiceItems: inputInvoiceItems = [] } = req.body;

  // Validate input
  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Required field: customerId',
    });
  }
  if (inputInvoiceItems.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one invoice item is required',
    });
  }

  try {
    // Validate tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found.',
      });
    }

    // Validate user
    const currentUser = await prisma.user.findUnique({
      where: { id: user },
      select: { tenantId: true, firstName: true, lastName: true },
    });
    if (!currentUser || currentUser.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Authenticated user not found or does not belong to tenant.',
      });
    }




    // Validate customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { unit: true },
    });
    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or does not belong to tenant.',
      });
    }

    // Optional: Status validation (uncomment if needed)
    /*
    if (customer.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Customer must be in PENDING status.',
      });
    }
    if (!customer.unitId || !customer.unit) {
      return res.status(400).json({
        success: false,
        message: 'Customer is not assigned to a unit.',
      });
    }
    if (customer.unit.status !== 'OCCUPIED_PENDING_PAYMENT') {
      return res.status(400).json({
        success: false,
        message: 'Unit is not in OCCUPIED_PENDING_PAYMENT status.',
      });
    }
    */

    // Validate and prepare invoice items
    const invoiceItems = [];
    for (const item of inputInvoiceItems) {
      if (
        !item.description ||
        !Number.isFinite(item.amount) ||
        item.amount <= 0 ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: 'Each invoice item must have a description, positive amount, and positive integer quantity.',
        });
      }
      invoiceItems.push({
        description: item.description,
        amount: parseFloat(item.amount.toFixed(2)),
        quantity: item.quantity,
      });
    }

    // Calculate total invoice amount
    const invoiceAmount = invoiceItems.reduce(
      (sum, item) => sum + item.amount * item.quantity,
      0
    );

    // Generate unique invoice number
    const invoiceNumber = generateInvoiceNumber(customerId);




    // Start a Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create invoice
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          customerId,
          unitId: customer.unitId,
          invoicePeriod: new Date(),
          invoiceNumber,
          invoiceAmount,
          amountPaid: 0,
          status: 'UNPAID',
          closingBalance: invoiceAmount,
          isSystemGenerated: false,
          createdBy: currentUser.firstName + ' ' + currentUser.lastName,
          createdAt: new Date(),
          updatedAt: new Date(),
          InvoiceItem: {
            create: invoiceItems.map((item) => ({
              description: item.description,
              amount: item.amount,
              quantity: item.quantity,
            })),
          },
        },
      });

   
      const deposits = await Promise.all(
        invoiceItems.map((item) =>
          tx.deposit.create({
            data: {
              tenantId,
              customerId,
              invoiceId: invoice.id,
              amount: item.amount * item.quantity,
              status: 'ACTIVE',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })
        )
      );

      // Log user activity
      const activity = await tx.userActivity.create({
        data: {
          userId: user,
          tenantId,
          action: `Created initial invoice ${invoice.invoiceNumber} for customer ${customerId} by ${currentUser.firstName} ${currentUser.lastName}`,
          timestamp: new Date(),
        },
      });

      return { invoice, deposits, activity };
    }, { timeout: 10000 }); // Increased timeout to 10 seconds

    return res.status(201).json({
      success: true,
      message: 'Initial invoice created successfully',
      data: {
        invoice: result.invoice,
        deposits: result.deposits,
      },
    });
  } catch (error) {
    console.error('Error creating initial invoice:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  } finally {
    await prisma.$disconnect();
  }
};




const invoiceCreate = async (req, res) => {
  const { tenantId, user } = req.user;
  const {
    customerId,
    isSystemGenerated = true,
    invoiceItems: inputInvoiceItems = [],
  } = req.body;

  // Validate required fields
  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Required field: customerId',
    });
  }

  try {
    // Validate tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found.',
      });
    }

    // Validate user
    const currentUser = await prisma.user.findUnique({
      where: { id: user },
      select: { tenantId: true, firstName: true, lastName: true },
    });
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Authenticated user not found.',
      });
    }
    if (currentUser.tenantId !== tenantId) {
      return res.status(403).json({
        success: false,
        message: 'User does not belong to the specified tenant.',
      });
    }

    // Validate customer and fetch unit
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { unit: { include: { building: true } } },
    });
    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or does not belong to tenant.',
      });
    }

    // Set invoice period to first day of previous month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const invoicePeriod = new Date(currentYear, currentMonth - 1, 1);

    // Initialize invoice items
    let invoiceItems = [];

    // Use inputInvoiceItems exclusively if provided
    if (inputInvoiceItems.length > 0) {
      // Validate input invoice items
      for (const item of inputInvoiceItems) {
        if (!item.description || !Number.isFinite(item.amount) || item.amount <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Each invoice item must have a description, positive amount, and positive integer quantity.',
          });
        }
      }
      invoiceItems = inputInvoiceItems.map(item => ({
        description: item.description,
        amount: parseFloat(item.amount.toFixed(2)),
        quantity: item.quantity,
      }));
    } else if (customer.unitId) {
      // Generate unit-related charges if no inputInvoiceItems and unit exists
      const unit = customer.unit;
      // Check building rates for consumption
      if (unit.building.gasRate === null || unit.building.waterRate === null) {
        return res.status(400).json({
          success: false,
          message: 'Gas rate or water rate not defined for this building.',
        });
      }

      // Fetch consumption records
      const gasConsumption = await prisma.gasConsumption.findFirst({
        where: { customerId, period: invoicePeriod },
        orderBy: { period: 'desc' },
      });

      const waterConsumption = await prisma.waterConsumption.findFirst({
        where: { customerId, period: invoicePeriod },
        orderBy: { period: 'desc' },
      });

      // Monthly Rent
      if (unit.monthlyCharge > 0) {
        invoiceItems.push({
          description: 'Monthly Rent',
          amount: parseFloat(unit.monthlyCharge.toFixed(2)),
          quantity: 1,
        });
      }

      // Garbage Charge
      if (unit.garbageCharge && unit.garbageCharge > 0) {
        invoiceItems.push({
          description: 'Garbage Collection',
          amount: parseFloat(unit.garbageCharge.toFixed(2)),
          quantity: 1,
        });
      }

      // Service Charge
      if (unit.serviceCharge && unit.serviceCharge > 0) {
        invoiceItems.push({
          description: 'Service Fee',
          amount: parseFloat(unit.serviceCharge.toFixed(2)),
          quantity: 1,
        });
      }

      // Gas Charge
      if (gasConsumption && gasConsumption.consumption > 0) {
        invoiceItems.push({
          description: `Gas Consumption (${gasConsumption.consumption} cubic meters)`,
          amount: parseFloat(unit.building.gasRate.toFixed(2)),
          quantity: parseInt(gasConsumption.consumption),
        });
      }

      // Water Charge
      if (waterConsumption && waterConsumption.consumption > 0) {
        invoiceItems.push({
          description: `Water Consumption (${waterConsumption.consumption} liters)`,
          amount: parseFloat(unit.building.waterRate.toFixed(2)),
          quantity: parseInt(waterConsumption.consumption),
        });
      }
    } else {
      // Fail if no unitId and no inputInvoiceItems
      return res.status(400).json({
        success: false,
        message: 'invoiceItems array is required when customer is not assigned to a unit.',
      });
    }

    // Calculate total invoice amount
    const invoiceAmount = invoiceItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    if (invoiceAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invoice amount must be greater than zero.',
      });
    }

    // Generate unique invoice number
    const invoiceNumber = generateInvoiceNumber(customerId);

    // Determine createdBy
    const createdBy = isSystemGenerated
      ? 'System'
      : `${currentUser.firstName} ${currentUser.lastName}`;

    // Update customer's closing balance
    const newClosingBalance = customer.closingBalance + invoiceAmount;

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        customerId,
        unitId: customer.unitId || null,
        invoicePeriod,
        invoiceNumber,
        invoiceAmount: parseFloat(invoiceAmount.toFixed(2)),
        amountPaid: 0,
        status: InvoiceStatus.UNPAID,
        closingBalance: newClosingBalance,
        isSystemGenerated,
        createdBy,
        InvoiceItem: {
          create: invoiceItems,
        },
      },
      include: {
        InvoiceItem: true,
      },
    });

    // Update customer closing balance
    await prisma.customer.update({
      where: { id: customerId },
      data: { closingBalance: newClosingBalance },
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Created invoice ${invoiceNumber} for customer ${customerId} by ${createdBy}`,
        timestamp: new Date(),
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: invoice,
    });
  } catch (error) {
    console.error('Error creating invoice:', error);

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (target?.includes('invoiceNumber')) {
        return res.status(400).json({
          success: false,
          message: 'Invoice number already exists.',
        });
      }
    }

    // Handle Prisma validation error
    if (error.name === 'PrismaClientValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided for invoice creation.',
      });
    }

    // Handle relation errors
    if (error.code === 'P2025') {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant, customer, or user reference.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  } finally {
    await prisma.$disconnect();
  }
};







// Create a manual invoice for a customer

async function createInvoice(req, res) {
  const { customerId, invoiceItemsData } = req.body;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant ID is required' });
  }

  if (!customerId || !Array.isArray(invoiceItemsData) || invoiceItemsData.length === 0) {
    return res.status(400).json({ error: 'Customer ID and invoice items are required' });
  }

  const invalidItems = invoiceItemsData.filter(
    item => !item.description || !item.amount || !item.quantity || item.amount <= 0 || item.quantity <= 0
  );

  if (invalidItems.length > 0) {
    return res.status(400).json({ error: 'Invalid invoice items', invalidItems });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or does not belong to this tenant' });
    }

    const invoicePeriod = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const currentClosingBalance = (await getCurrentClosingBalance(customer.id)) || 0;
    const invoiceAmount = Math.round(
      invoiceItemsData.reduce((total, item) => total + item.amount * item.quantity, 0) * 100
    ) / 100;

    if (invoiceAmount <= 0) {
      return res.status(400).json({ error: 'Invalid invoice amount' });
    }

    const newClosingBalance = currentClosingBalance + invoiceAmount;


    let invoiceStatus;
    if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
      invoiceStatus = 'PAID';
    } else if (newClosingBalance === 0) {
      invoiceStatus = 'PAID';
    } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
      invoiceStatus = 'PPAID';
    } else {
      invoiceStatus = 'UNPAID';
    }

    const newInvoice = await prisma.$transaction(async (prisma) => {
      const createdInvoice = await prisma.invoice.create({
        data: {
          customerId,
          tenantId  ,
          invoiceNumber,
          invoicePeriod,
          closingBalance: newClosingBalance,
          invoiceAmount,
          status: invoiceStatus,
          isSystemGenerated: false,
        },
      });

      await prisma.invoiceItem.createMany({
        data: invoiceItemsData.map(itemData => ({
          invoiceId: createdInvoice.id,
          description: itemData.description,
          amount: itemData.amount,
          quantity: itemData.quantity,
        })),
      });

      await prisma.customer.update({
        where: { id: customerId },
        data: { closingBalance: newClosingBalance },
      });

      return createdInvoice;
    });

    res.status(200).json({ newInvoice });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}





// Cancel an invoice by ID
async function cancelInvoice(invoiceId) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        invoiceAmount: true,
        customerId: true,
        closingBalance: true,
        status: true,
      },
    });

    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'CANCELLED') return invoice;

    const currentClosingBalance = await getCurrentClosingBalance(invoice.customerId);
    const newClosingBalance = currentClosingBalance - invoice.invoiceAmount;

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'CANCELLED',
        closingBalance: newClosingBalance,
      },
    });

    await prisma.customer.update({
      where: { id: invoice.customerId },
      data: { closingBalance: newClosingBalance },
    });

    return updatedInvoice;
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    throw error;
  }
}

// Cancel system-generated invoices atomically
async function cancelSystemGeneratedInvoices() {
  const transaction = await prisma.$transaction(async (prisma) => {
    try {
      // Fetch the latest system-generated invoice
      const latestInvoice = await prisma.invoice.findFirst({
        where: { isSystemGenerated: true },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestInvoice) return null;

      const currentClosingBalance = await getCurrentClosingBalance(latestInvoice.customerId);
      const newClosingBalance = currentClosingBalance - latestInvoice.invoiceAmount;

      // Update the invoice status and closing balance
      const updatedInvoice = await prisma.invoice.update({
        where: { id: latestInvoice.id },
        data: {
          status: 'CANCELLED',
          closingBalance: currentClosingBalance, // Retain the original balance before canceling
        },
      });

      // Update the customer's closing balance
      await prisma.customer.update({
        where: { id: latestInvoice.customerId },
        data: { closingBalance: newClosingBalance },
      });

      return updatedInvoice;
    } catch (error) {
      console.error('Error cancelling system-generated invoice:', error);
      throw new Error('Transaction failed');
    }
  });

  return transaction;
}



async function getAllInvoices(req, res) {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(403).json({ error: "Tenant ID is required to fetch invoices" });
  }

  // Extract pagination parameters from query (default to page 1, limit 10)
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit; // Calculate offset

  try {
    // Fetch total count for pagination
    const total = await prisma.invoice.count({
      where: { tenantId },
    });

    // Fetch paginated invoices with selective fields
    const invoices = await prisma.invoice.findMany({
      where: { tenantId },
      skip, // Pagination offset
      take: limit, // Number of records to fetch
      select: {
        id: true,
        invoiceNumber: true,
        invoiceAmount: true,
        amountPaid: true, // Added from updated schema
        closingBalance: true,
        invoicePeriod: true,
        status: true,
        isSystemGenerated: true,
        createdBy: true, // Added from updated schema
        createdAt: true,
        updatedAt: true, // Added for completeness
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true, // Optional, included if unit exists
          },
        },
        InvoiceItem : {
          select: {
            id: true, // Added for unique identification
            description: true,
            quantity: true, // Added for more detail
            amount: true, // Added for more detail
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            modeOfPayment: true,
            createdAt: true,
          },
        },
      
        ReceiptInvoice: {
          select: {
            receiptId: true,
            invoiceId: true,
            
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Format response to match frontend expectation

    console.log(`Fetched ${invoices.length} invoices for tenant ${tenantId}.`);
    res.json({
      invoices,
      total,
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ error: "Internal server error while fetching invoices" });
  }
}



// Cancel an invoice by ID (for API)
async function cancelInvoiceById(req, res) {
  const { invoiceId } = req.params;
  const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to cancel invoices' });
  }

  try {
    // Retrieve the invoice details including the tenant ID, customer ID, and invoice amount
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        tenantId: true,
        invoiceAmount: true,
        customerId: true,
        status: true,
      },
    });

    // Check if the invoice exists
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Verify that the invoice belongs to the authenticated tenant
    if (invoice.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Access denied: You do not own this invoice' });
    }

    // Check if the invoice is already cancelled
    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Invoice is already cancelled' });
    }

    // Retrieve the customer details to get the current closing balance
    const customer = await prisma.customer.findUnique({
      where: { id: invoice.customerId },
      select: { closingBalance: true },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Calculate the new closing balance for the customer
    const newClosingBalance = customer.closingBalance - invoice.invoiceAmount;

    // Update the invoice status to "CANCELLED" and the customer's closing balance in a transaction
    const [updatedInvoice] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'CANCELLED',
        },
      }),
      prisma.customer.update({
        where: { id: invoice.customerId },
        data: { closingBalance: newClosingBalance },
      }),
    ]);

    // Return a success response
    res.status(200).json({
      message: 'Invoice cancelled successfully',
      invoice: updatedInvoice,
      newClosingBalance,
    });
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}





async function getInvoiceDetails(req, res) {
  const { id } = req.params;
  const { tenantId, user } = req.user;

  // Validate tenantId
  if (!tenantId) {
    return res.status(403).json({
      success: false,
      message: "Tenant ID is required",
    });
  }

  try {
    // Fetch the invoice with related data
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        InvoiceItem: {
          select: {
            id: true,
            description: true,
            amount: true,
            quantity: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            closingBalance: true,
            email: true,
            unit: {
              select: {
                id: true,
                unitNumber: true,
                building: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            createdAt: true,
            modeOfPayment: true,
            transactionId: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Check if the invoice exists
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Verify tenant ownership
    if (invoice.tenantId !== tenantId) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You do not own this invoice",
      });
    }

    // Compute additional fields
    const totalItems = invoice.InvoiceItem.length; // Fixed: Changed from invoice.items
    const outstandingBalance = invoice.invoiceAmount - invoice.amountPaid;
    const formattedInvoice = {
      ...invoice,
      invoicePeriod: invoice.invoicePeriod ? new Date(invoice.invoicePeriod).toISOString() : null,
      createdAt: invoice.createdAt ? new Date(invoice.createdAt).toISOString() : null,
      totalItems,
      outstandingBalance,
      customer: {
        ...invoice.customer,
        unitName: invoice.customer?.unit?.unitNumber || "Not Assigned",
        buildingName: invoice.customer?.unit?.building?.name || "N/A",
      },
    };

    // Log user activity asynchronously to avoid blocking
    prisma.userActivity
      .create({
        data: {
          user: { connect: { id: user } },
          tenant: { connect: { id: tenantId } },
          action: `Viewed invoice ${invoice.invoiceNumber} details`,
          timestamp: new Date(),
        },
      })
      .catch((err) => console.error("Error logging user activity:", err)); // Non-blocking

    return res.status(200).json({
      success: true,
      data: formattedInvoice,
    });
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    if (error.name === "PrismaClientValidationError") {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice ID format",
      });
    }
    if (error.code === "P2023") {
      // Prisma timeout or database error
      return res.status(500).json({
        success: false,
        message: "Database operation timed out",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await prisma.$disconnect();
  }
}


async function cancelCustomerInvoice(req, res) {
  const { id } = req.params;
  const { tenantId, user } = req.user; // Assuming userId from auth middleware
console.log(`this is userid ${JSON.stringify(req.user)}`);
  try {
    // Validate invoiceId
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Invalid invoice ID' });
    }

    // Fetch the invoice with customer details
    const invoice = await prisma.invoice.findUnique({
      where: { id: id },
      include: { customer: true },
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Permission check using tenantId scalar field
    if (!tenantId ) {
      return res.status(403).json({ message: 'You are not authorized to cancel this invoice' });
    }

    // Check if invoice can be canceled
    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Invoice is already canceled' });
    }
    if (invoice.status === 'PAID') {
      return res.status(400).json({ message: 'Cannot cancel a fully paid invoice' });
    }

    // Use a transaction to update invoice, customer, and create audit log
    const [updatedInvoice, updatedCustomer] = await prisma.$transaction([
      // Update invoice status to CANCELLED
    
      // Update customer's closingBalance
      prisma.invoice.update({
        where: { id: id },
        data: {
          status: 'CANCELLED',
          tenant: {
            connect: { id: tenantId }, // Connect invoice to the correct tenant
          },
        },
      }),
      

      prisma.customer.update({
        where: { id: invoice.customerId },
        data: {
          closingBalance: {
            decrement: invoice.invoiceAmount,
          },
          tenant: {
            connect: { id: tenantId }, // Connect invoice to the correct tenant
          },
        },
      }),
      
      // Create audit log entry
      prisma.auditLog.create({
        data: {
          tenant: {
            connect: { id: tenantId }, // Connect invoice to the correct tenant
          },
          user:  {
            connect: { id: user }
          },
          action: 'CANCEL',
          resource: 'INVOICE',
          details: {
            invoiceId: id,
            invoiceNumber: invoice.invoiceNumber,
            previousStatus: invoice.status,
            customerId: invoice.customerId,
            invoiceAmount: invoice.invoiceAmount,
          },
          description: `Invoice ${invoice.invoiceNumber} canceled by user ${user}`,
        },
      }),
    ]);

    // Return success response
    return res.status(200).json({
      message: 'Invoice canceled successfully',
      invoice: {
        id: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        status: updatedInvoice.status,
     
      },
      customer: {
        id: updatedCustomer.id,
        firstName: updatedCustomer.firstName,
        lastName: updatedCustomer.lastName,
        closingBalance: updatedCustomer.closingBalance,
      },
    });
  } catch (error) {
    console.error('Error canceling invoice:', error);
    return res.status(500).json({ message: 'Failed to cancel invoice' });
  } finally {
    await prisma.$disconnect();
  }
}





// Phone number sanitization function
const sanitizePhoneNumber = (phone) => {
    if (!phone) return null;

    // Remove all non-numeric characters
    let sanitized = phone.replace(/\D/g, '');

    // Normalize to start with '0' (Kenyan numbers usually start with '07' or '01')
    if (sanitized.startsWith('254')) {
        sanitized = '0' + sanitized.substring(3); // Convert '2547...' to '07...' or '2541...' to '01...'
    } else if (sanitized.startsWith('+254')) {
        sanitized = '0' + sanitized.substring(4);
    } else if (!sanitized.startsWith('0')) {
        return null; // Invalid number format
    }

    return sanitized;
};

const searchInvoices = async (req, res) => {
  const { phoneNumber, firstName, lastName } = req.query;
  const tenantId = req.user?.tenantId;

  // Validate tenantId from req.user
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }

  // Ensure at least one search parameter is provided
  if (!phoneNumber && !firstName && !lastName) {
    return res.status(400).json({ error: 'At least one of phoneNumber, firstName, or lastName is required' });
  }

  // Sanitize phone number if provided
  const sanitizedPhoneNumber = phoneNumber ? sanitizePhoneNumber(phoneNumber) : null;

  // If phoneNumber was provided but sanitization failed, return an error
  if (phoneNumber && !sanitizedPhoneNumber) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: tenantId,
        customer: {
          OR: [
            sanitizedPhoneNumber
              ? {
                  OR: [
                    { phoneNumber: { contains: sanitizedPhoneNumber } },
                    { secondaryPhoneNumber: { contains: sanitizedPhoneNumber } },
                  ],
                }
              : undefined,
            firstName ? { firstName: { contains: firstName, mode: 'insensitive' } } : undefined,
            lastName ? { lastName: { contains: lastName, mode: 'insensitive' } } : undefined,
          ].filter(Boolean),
        },
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            secondaryPhoneNumber: true,
          },
        },
      },
    });

    res.json(invoices);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};



// Exporting all functions
module.exports = {
  createInvoice,
  generateInvoices,
  cancelInvoice,
  cancelSystemGeneratedInvoices,
  getAllInvoices,
  cancelInvoiceById,
  getInvoiceDetails,
  getCurrentClosingBalance,
  getCurrentMonthBill,
  generateInvoicesByDay,
  generateInvoicesPerTenant,searchInvoices,
  generateInvoicesForAll ,cancelCustomerInvoice,
  invoiceCreate ,createInitialInvoice
};
