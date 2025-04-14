const { PrismaClient } = require('@prisma/client');
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






async function processCustomerBatchForAll(customers, currentMonth) {
  const invoices = [];
  const invoiceItems = [];
  const customerUpdates = [];
  const year = new Date().getFullYear();

  for (const customer of customers) {
    const invoiceNumber = generateInvoiceNumber(customer.id);
    const invoicePeriod = new Date(year, currentMonth - 1, 1);
    const invoiceAmount = customer?.monthlyCharge || 0;
    const previousClosingBalance = customer?.closingBalance || 0;

    let status = 'UNPAID';
    let amountPaid = 0;
    let newClosingBalance = previousClosingBalance + invoiceAmount;

    if (previousClosingBalance < 0) {
      const availableCredit = Math.abs(previousClosingBalance);
      if (availableCredit >= invoiceAmount) {
        status = 'PAID';
        amountPaid = invoiceAmount;
        newClosingBalance = previousClosingBalance + invoiceAmount;
      } else {
        status = 'PPAID';
        amountPaid = availableCredit;
        newClosingBalance = previousClosingBalance + invoiceAmount;
      }
    }

    const invoice = {
      tenantId: customer.tenantId,
      customerId: customer.id,
      invoicePeriod: invoicePeriod,
      invoiceNumber: invoiceNumber,
      invoiceAmount: invoiceAmount,
      closingBalance: newClosingBalance,
      status: status,
      isSystemGenerated: true,
      createdAt: new Date(),
      amountPaid: amountPaid,
    };

    invoices.push(invoice);

    const invoiceItem = {
      description: `Monthly charge for ${invoicePeriod.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
      amount: invoiceAmount,
      quantity: 1,
    };

    invoiceItems.push(invoiceItem);

    customerUpdates.push({
      where: { id: customer.id },
      data: { closingBalance: newClosingBalance },
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Bulk create invoices
      const createdInvoices = await tx.invoice.createMany({
        data: invoices,
        skipDuplicates: true, // Optional: skip if invoiceNumber already exists
      });

      // Fetch created invoices to get their IDs
      const fetchedInvoices = await tx.invoice.findMany({
        where: { invoiceNumber: { in: invoices.map(i => i.invoiceNumber) } },
        select: { id: true, invoiceNumber: true },
      });

      // Map invoice items to their corresponding invoice IDs
      const updatedInvoiceItems = invoiceItems.map((item, index) => ({
        ...item,
        invoiceId: fetchedInvoices.find(i => i.invoiceNumber === invoices[index].invoiceNumber).id,
      }));

      // Step 2: Bulk create invoice items
      await tx.invoiceItem.createMany({
        data: updatedInvoiceItems,
      });

      // Step 3: Bulk update customer balances
      await Promise.all(customerUpdates.map(update => tx.customer.update(update)));

      return fetchedInvoices;
    }, { timeout: 20000 }); // 10 seconds timeout as a safety net

    return result;
  } catch (error) {
    console.error('Error in transaction (invoices, items, and customer updates):', error);
    throw error;
  }
}

// Endpoint handler (unchanged)
async function generateInvoicesForAll(req, res) {
  const { tenantId } = req.user;
  const currentMonth = new Date().getMonth() + 1;

  try {
    console.time('Find Customers');
    const customers = await prisma.customer.findMany({
      where: { 
        status: 'ACTIVE',
        tenantId: tenantId
      },
      select: {
        id: true,
        tenantId: true,
        monthlyCharge: true,
        closingBalance: true
      }
    });
    console.timeEnd('Find Customers');
    console.log(`Found ${customers.length} active customers for tenant ${tenantId}.`);

    const allInvoices = await processCustomerBatchForAll(customers, currentMonth);

    console.log(`Generated ${allInvoices.length} invoices, added items, and updated customer balances for tenant ${tenantId}.`);
    
    res.status(200).json({
      success: true,
      count: allInvoices.length,
      invoices: allInvoices
    });
  } catch (error) {
    console.error(`Error generating invoices for tenant ${tenantId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoices and update balances'
    });
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
      let status = 'UNPAID'; // Default status
      const newClosingBalance = currentClosingBalance + invoiceAmount;

      if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
        status = 'PAID';
      } else if (newClosingBalance === 0) {
        status = 'PAID';
      } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
        status = 'PPAID';
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
      let status = 'UNPAID'; // Default status
      const newClosingBalance = currentClosingBalance + invoiceAmount;

      if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
        status = 'PAID';
      } else if (newClosingBalance === 0) {
        status = 'PAID';
      } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
        status = 'PPAID';
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

        let status = 'UNPAID';
        const newClosingBalance = currentClosingBalance + invoiceAmount;

        if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
          status = 'PAID';
        } else if (newClosingBalance === 0) {
          status = 'PAID';
        } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
          status = 'PPAID';
        } else {
          status = 'UNPAID';
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
    const invoiceNumber = generateInvoiceNumber(customerId);

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

// Get all invoices, ordered by the latest first
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
        closingBalance: true,
        invoicePeriod: true,
        status: true,
        isSystemGenerated: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        items: {
          select: {
            description: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Format response to match frontend expectation
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





// Get invoice details by ID
async function getInvoiceDetails(req, res) {
  const { id } = req.params; // Extract the invoice ID from the route parameters
  const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required' });
  }

  try {
    // Fetch the invoice and verify tenant ownership
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });

    // Check if the invoice exists
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Verify that the invoice belongs to the authenticated tenant
    if (invoice.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Access denied: You do not own this invoice' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice details:', error);
    res.status(500).json({ message: 'Error fetching invoice details' });
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
  generateInvoicesForAll ,cancelCustomerInvoice
};
