const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sanitizePhoneNumber = (phone) => {
  if (!phone) return null;

  // Remove all non-numeric characters
  let sanitized = phone.replace(/\D/g, '');

  // Normalize to start with '0' (Kenyan numbers usually start with '07' or '01')
  if (sanitized.startsWith('254')) {
    sanitized = '0' + sanitized.substring(3);
  } else if (sanitized.startsWith('+254')) {
    sanitized = '0' + sanitized.substring(4);
  } else if (!sanitized.startsWith('0')) {
    sanitized = '0' + sanitized; // Assume local number needs leading '0'
  }

  return sanitized;
};

const SearchCustomers = async (req, res) => {
  const { phone, name, page = 1, limit = 10 } = req.query;
  const tenantId = req.user?.tenantId;

  console.log('Tenant ID:', tenantId);
  console.log('Raw phone number:', phone);
  console.log('Name query:', name);
  console.log('Page:', page, 'Limit:', limit);

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  try {
    // Parse pagination params
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Base query
    let query = {
      where: {
        tenantId,
      },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        secondaryPhoneNumber: true,
        nationalId: true,
        status: true,
        closingBalance: true,
        leaseFileUrl: true,
        leaseStartDate: true,
        leaseEndDate: true,
        unitId: true,
        createdAt: true,
        updatedAt: true,
        unit: {
          select: {
            unitNumber: true,
            status: true,
            monthlyCharge: true,
            depositAmount: true,
            building: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    };

    // Handle phone search (exact match on phoneNumber or secondaryPhoneNumber)
    if (phone) {
      const sanitizedPhone = sanitizePhoneNumber(phone);
      console.log('Sanitized phone number:', sanitizedPhone);
      query.where.OR = [
        { phoneNumber: sanitizedPhone },
        { secondaryPhoneNumber: sanitizedPhone },
      ];
    }
    // Handle name search (partial match)
    else if (name) {
      query.where.OR = [
        {
          firstName: {
            contains: name.trim(),
            mode: 'insensitive',
          },
        },
        {
          lastName: {
            contains: name.trim(),
            mode: 'insensitive',
          },
        },
      ];
    }

    // Fetch customers
    const customers = await prisma.customer.findMany(query);

    // Fetch total count for pagination
    const totalCustomers = await prisma.customer.count({
      where: query.where,
    });

    // Format response
    const formattedCustomers = customers.map((customer) => ({
      ...customer,
      buildingName: customer.unit?.building?.name || null,
    }));

    res.status(200).json({
      customers: formattedCustomers,
      total: totalCustomers,
      descending: true,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCustomers / limitNum),
    });
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};

const SearchCustomersByName = async (req, res) => {
  const { name } = req.query;
  const tenantId = req.user?.tenantId;

  console.log('Tenant ID:', tenantId);
  console.log('Search name:', name);

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        OR: [
          { firstName: { contains: name.trim(), mode: 'insensitive' } },
          { lastName: { contains: name.trim(), mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        secondaryPhoneNumber: true,
        nationalId: true,
        status: true,
        closingBalance: true,
        leaseFileUrl: true,
        leaseStartDate: true,
        leaseEndDate: true,
        unitId: true,
        createdAt: true,
        updatedAt: true,
        unit: {
          select: {
            unitNumber: true,
            status: true,
            monthlyCharge: true,
            depositAmount: true,
            building: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (customers.length > 0) {
      const formattedCustomers = customers.map((customer) => ({
        ...customer,
        buildingName: customer.unit?.building?.name || null,
      }));
      res.status(200).json(formattedCustomers);
    } else {
      res.status(404).json({ message: 'No customers found with this name' });
    }
  } catch (error) {
    console.error('Error searching customers by name:', error);
    res.status(500).json({ message: 'Failed to search customers', error: error.message });
  }
};

const SearchCustomersByPhoneNumber = async (req, res) => {
  const { phone } = req.query;
  const tenantId = req.user?.tenantId;

  console.log('Tenant ID:', tenantId);
  console.log('Raw phone number:', phone);

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  if (!phone) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  try {
    const sanitizedPhone = sanitizePhoneNumber(phone);
    console.log('Sanitized phone number:', sanitizedPhone);

    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        OR: [
          { phoneNumber: sanitizedPhone },
          { secondaryPhoneNumber: sanitizedPhone },
        ],
      },
      select: {
        jorn: true,
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        secondaryPhoneNumber: true,
        nationalId: true,
        status: true,
        closingBalance: true,
        leaseFileUrl: true,
        leaseStartDate: true,
        leaseEndDate: true,
        unitId: true,
        createdAt: true,
        updatedAt: true,
        unit: {
          select: {
            unitNumber: true,
            status: true,
            monthlyCharge: true,
            depositAmount: true,
            building: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (customers.length > 0) {
      const formattedCustomers = customers.map((customer) => ({
        ...customer,
        buildingName: customer.unit?.building?.name || null,
      }));
      res.status(200).json(formattedCustomers);
    } else {
      res.status(404).json({ message: 'No customer found with this phone number' });
    }
  } catch (error) {
    console.error('Error searching customers by phone:', error);
    res.status(500).json({ message: 'Failed to search customers', error: error.message });
  }
};

module.exports = { SearchCustomers, SearchCustomersByName, SearchCustomersByPhoneNumber };