const { PrismaClient,CustomerStatus } = require('@prisma/client'); // Import the enum
const prisma = new PrismaClient();
// Create a new customer

const createCustomer = async (req, res) => {
  const {
    tenantId,
    firstName,
    lastName,
    email,
    phoneNumber,
    secondaryPhoneNumber,
    gender,
    county,
    town,
    location,
    estateName,
    building,
    houseNumber,
    category,
    monthlyCharge,
    garbageCollectionDay,
    collected,
    closingBalance,
    status,
    trashBagsIssued

  } = req.body;

  // Validate required fields
  if (!tenantId || !firstName || !lastName || !phoneNumber || !monthlyCharge || !garbageCollectionDay) {
    return res.status(400).json({ message: 'Required fields are missing.' });
  }

  // Validate status
  const validStatuses = Object.values(CustomerStatus);
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ message: `Invalid status value. Valid values: ${validStatuses.join(', ')}` });
  }

  // Validate garbage collection day


  // Validate location format
  const locationPattern = /^-?\d+\.\d+,-?\d+\.\d+$/;
  if (location && !locationPattern.test(location)) {
    return res.status(400).json({ message: 'Invalid location format. Please use "latitude,longitude".' });
  }

  try {
    // Check if tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found.' });
    }

    // Check if authenticated user belongs to the tenant
    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({ message: 'User does not belong to the specified tenant.' });
    }

    // Check if phone number already exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { phoneNumber },
    });

    if (existingCustomer && existingCustomer.tenantId === tenantId) {
      return res.status(400).json({ message: 'Phone number already exists for this tenant.' });
    }

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        firstName,
        lastName,
        email,
        phoneNumber,
        secondaryPhoneNumber,
        gender,
        county,
        town,
        location,
        estateName,
        building,
        houseNumber,
        category,
        monthlyCharge:parseFloat(monthlyCharge),
        garbageCollectionDay,
        trashBagsIssued :trashBagsIssued?? false,
        status: status ?? 'ACTIVE', // Use default if not provided
        collected: collected ?? false, // Default to false
        closingBalance:parseFloat(closingBalance) ?? 0, // Default to 0
      },
    });

    res.status(201).json({ message: 'Customer created successfully', customer });
  } catch (error) {
    console.error('Error creating customer:', error);

    // Handle unique constraint violation (e.g., phoneNumber)
    if (error.code === 'P2002' && error.meta?.target.includes('phoneNumber')) {
      return res.status(400).json({ message: 'Phone number must be unique.' });
    }

    // Handle other errors
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { createCustomer };
