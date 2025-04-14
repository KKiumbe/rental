const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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

// Search invoices by phone number
const searchInvoicesByPhone = async (req, res) => {
  const { phone, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Validate tenantId
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }

  // Ensure phone number is provided
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Sanitize phone number
  const sanitizedPhoneNumber = sanitizePhoneNumber(phone);
  if (!sanitizedPhoneNumber) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  try {
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          tenantId,
          customer: {
            OR: [
              { phoneNumber: { contains: sanitizedPhoneNumber } },
              { secondaryPhoneNumber: { contains: sanitizedPhoneNumber } },
            ],
          },
        },
        skip,
        take: parseInt(limit),
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
      }),
      prisma.invoice.count({
        where: {
          tenantId,
          customer: {
            OR: [
              { phoneNumber: { contains: sanitizedPhoneNumber } },
              { secondaryPhoneNumber: { contains: sanitizedPhoneNumber } },
            ],
          },
        },
      }),
    ]);

    res.json({ invoices, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};

// Search invoices by name
const searchInvoicesByName = async (req, res) => {
  const { firstName, lastName, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Validate tenantId
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID not found' });
  }

  // Ensure at least one name parameter is provided
  if (!firstName && !lastName) {
    return res.status(400).json({ error: 'At least one of firstName or lastName is required' });
  }

  try {
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          tenantId,
          customer: {
            OR: [
              firstName ? { firstName: { contains: firstName, mode: 'insensitive' } } : undefined,
              lastName ? { lastName: { contains: lastName, mode: 'insensitive' } } : undefined,
            ].filter(Boolean),
          },
        },
        skip,
        take: parseInt(limit),
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
      }),
      prisma.invoice.count({
        where: {
          tenantId,
          customer: {
            OR: [
              firstName ? { firstName: { contains: firstName, mode: 'insensitive' } } : undefined,
              lastName ? { lastName: { contains: lastName, mode: 'insensitive' } } : undefined,
            ].filter(Boolean),
          },
        },
      }),
    ]);

    res.json({ invoices, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};



module.exports = { searchInvoicesByPhone, searchInvoicesByName };