const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Controller function to fetch all receipts
const getReceipts = async (req, res) => {
    const { tenantId } = req.user; // Extract tenantId from authenticated user
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page
    const skip = (page - 1) * limit; // Calculate the number of records to skip
  
    // Validate tenantId
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required to fetch receipts.' });
    }
  
    try {
      // Fetch paginated receipts with their associated payment, customer, and invoice details
      const [receipts, total] = await Promise.all([
        prisma.receipt.findMany({
          where: { tenantId },
          skip, // Offset for pagination
          take: limit,
          orderBy: { createdAt: 'desc' }, 
          include: {
            payment: true, // Include payment details
            customer: {
              select: {
                firstName: true,
                lastName: true,
                phoneNumber: true,
                closingBalance: true,
              },
            },
            receiptInvoices: {
              include: {
                invoice: true, // Include invoice details
              },
            },
          },
        
        }),
        prisma.receipt.count({ where: { tenantId } }), // Get total count for pagination
      ]);
  
      // Check if receipts were found
      if (!receipts.length) {
        return res.status(404).json({ message: 'No receipts found.' });
      }
  
      // Format the receipts
      const formattedReceipts = receipts.map((receipt) => ({
        ...receipt,
        createdAt: receipt.createdAt.toISOString(), // Format createdAt
        customer: {
          ...receipt.customer,
          closingBalance: receipt.customer?.closingBalance || 0, // Default to 0 if null
        },
      }));
  
      // Return paginated response
      res.status(200).json({
        receipts: formattedReceipts,
        total, // Total number of receipts for pagination
        page, // Current page
        limit, // Items per page
        totalPages: Math.ceil(total / limit), // Total pages
      });
    } catch (error) {
      console.error('Error fetching receipts:', error);
      res.status(500).json({ error: 'Failed to fetch receipts.' });
    }
  };
  


// Controller function to fetch a receipt by its ID
const getReceiptById = async (req, res) => {
    const { id } = req.params; // Extract receipt ID from the route parameters
    const {tenantId} = req.user; // Extract tenantId from authenticated user

    // Validate required fields
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant ID is required to make payments.' });
    }
    try {
        // Fetch the receipt with the specified ID, including related payment, customer (with closing balance), and invoice details
        const receipt = await prisma.receipt.findUnique({
            where: {
                id: id, tenantId // Match the receipt by ID
            },
            include: {
                payment: true, // Include payment details
                customer: {    // Include customer details, including closingBalance
                    select: {
                        firstName: true,    // Replace 'name' with valid fields like 'firstName' and 'lastName'
                        lastName: true,
                        phoneNumber: true,
                        closingBalance: true, // Fetch the closing balance from the customer collection
                    },
                },
                receiptInvoices: {
                    include: {
                        invoice: true, // Include invoice details for each receipt
                    },
                },
            },
        });

        // Check if the receipt was found
        if (!receipt) {
            return res.status(404).json({ message: `Receipt with ID ${id} not found.` });
        }

        // Format the receipt to include createdAt timestamp and customer closingBalance
        const formattedReceipt = {
            ...receipt,
            createdAt: receipt.createdAt.toISOString(), // Format createdAt for better readability
            customer: {
                ...receipt.customer,
                closingBalance: receipt.customer?.closingBalance || 0, // Include customer closingBalance (default to 0 if not found)
            },
        };

        res.status(200).json(formattedReceipt);
    } catch (error) {
        console.error('Error fetching receipt:', error);
        res.status(500).json({ error: 'Failed to fetch the receipt.' });
    }
};



// Phone number sanitization function
const sanitizePhoneNumber = (phone) => {
  if (!phone) return null;
  let sanitized = phone.replace(/\D/g, '');
  if (sanitized.startsWith('254')) {
    sanitized = '0' + sanitized.substring(3);
  } else if (sanitized.startsWith('+254')) {
    sanitized = '0' + sanitized.substring(4);
  } else if (!sanitized.startsWith('0')) {
    return null;
  }
  return sanitized;
};

// Search receipts by phone number with pagination
const searchReceiptsByPhone = async (req, res) => {
  const { tenantId } = req.user;
  const { phone, page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to search receipts.' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  const sanitizedPhoneNumber = sanitizePhoneNumber(phone);
  if (!sanitizedPhoneNumber) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  try {
    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where: {
          tenantId,
          OR: [
            { phoneNumber: { contains: sanitizedPhoneNumber } },
            { customer: { phoneNumber: { contains: sanitizedPhoneNumber } } },
            { customer: { secondaryPhoneNumber: { contains: sanitizedPhoneNumber } } },
          ],
        },
        skip,
        take: parseInt(limit),
        include: {
          payment: true,
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              closingBalance: true,
            },
          },
          receiptInvoices: {
            include: {
              invoice: true,
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
      }),
      prisma.receipt.count({
        where: {
          tenantId,
          OR: [
            { phoneNumber: { contains: sanitizedPhoneNumber } },
            { customer: { phoneNumber: { contains: sanitizedPhoneNumber } } },
            { customer: { secondaryPhoneNumber: { contains: sanitizedPhoneNumber } } },
          ],
        },
      }),
    ]);

    if (!receipts.length) {
      return res.status(404).json({ message: 'No receipts found for this phone number.' });
    }

    const formattedReceipts = receipts.map((receipt) => ({
      ...receipt,
      createdAt: receipt.createdAt.toISOString(),
      customer: {
        ...receipt.customer,
        closingBalance: receipt.customer?.closingBalance || 0,
      },
    }));

    res.status(200).json({
      receipts: formattedReceipts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error searching receipts by phone:', error);
    res.status(500).json({ error: 'Failed to search receipts by phone.' });
  }
};

// Search receipts by name with pagination
const searchReceiptsByName = async (req, res) => {
  const { tenantId } = req.user;
  const { firstName, lastName, page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to search receipts.' });
  }
  if (!firstName && !lastName) {
    return res.status(400).json({ error: 'At least one of firstName or lastName is required.' });
  }

  try {
    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where: {
          tenantId,
          OR: [
            { paidBy: firstName ? { contains: firstName, mode: 'insensitive' } : undefined },
            { customer: { firstName: firstName ? { contains: firstName, mode: 'insensitive' } : undefined } },
            { customer: { lastName: lastName ? { contains: lastName, mode: 'insensitive' } : undefined } },
          ].filter(Boolean),
        },
        skip,
        take: parseInt(limit),
        include: {
          payment: true,
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              closingBalance: true,
            },
          },
          receiptInvoices: {
            include: {
              invoice: true,
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
      }),
      prisma.receipt.count({
        where: {
          tenantId,
          OR: [
            { paidBy: firstName ? { contains: firstName, mode: 'insensitive' } : undefined },
            { customer: { firstName: firstName ? { contains: firstName, mode: 'insensitive' } : undefined } },
            { customer: { lastName: lastName ? { contains: lastName, mode: 'insensitive' } : undefined } },
          ].filter(Boolean),
        },
      }),
    ]);

    if (!receipts.length) {
      return res.status(404).json({ message: 'No receipts found for this name.' });
    }

    const formattedReceipts = receipts.map((receipt) => ({
      ...receipt,
      createdAt: receipt.createdAt.toISOString(),
      customer: {
        ...receipt.customer,
        closingBalance: receipt.customer?.closingBalance || 0,
      },
    }));

    res.status(200).json({
      receipts: formattedReceipts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error searching receipts by name:', error);
    res.status(500).json({ error: 'Failed to search receipts by name.' });
  }
};

module.exports = { getReceipts, searchReceiptsByPhone, searchReceiptsByName,  getReceiptById, };



