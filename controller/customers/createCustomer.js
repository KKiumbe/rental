const { PrismaClient, CustomerStatus } = require('@prisma/client');
const prisma = new PrismaClient();



const createCustomer = async (req, res) => {
  const { tenantId } = req.user;
  const {
    buildingId,
    firstName,
    lastName,
    email,
    phoneNumber,
    secondaryPhoneNumber,
    houseNumber,
    monthlyCharge,
    garbageCharge,
    serviceCharge,
    closingBalance,
    status,
  } = req.body;

  // Validate required fields
  if (!tenantId || !buildingId || !firstName || !lastName || !phoneNumber || !monthlyCharge) {
    return res.status(400).json({
      message: 'Required fields: tenantId, buildingId, firstName, lastName, phoneNumber, monthlyCharge.',
    });
  }

  // Validate status
  const validStatuses = ['ACTIVE', 'INACTIVE']; // Adjust based on CustomerStatus enum
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
    });
  }

  // Validate numeric fields
  const numericFields = { monthlyCharge, garbageCharge, serviceCharge, closingBalance };
  for (const [field, value] of Object.entries(numericFields)) {
    if (value !== undefined && (isNaN(value) || value < 0)) {
      return res.status(400).json({ message: `${field} must be a non-negative number.` });
    }
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

    // Check if building exists and belongs to tenant
    const building = await prisma.building.findUnique({
      where: { id: buildingId },
    });

    if (!building || building.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Building not found or does not belong to tenant.' });
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
        buildingId,
        firstName,
        lastName,
        email,
        phoneNumber,
        secondaryPhoneNumber,
        houseNumber,
        monthlyCharge: parseFloat(monthlyCharge),
        garbageCharge: garbageCharge ? parseFloat(garbageCharge) : null,
        serviceCharge: serviceCharge ? parseFloat(serviceCharge) : null,
        status: status ?? 'ACTIVE',
        closingBalance: closingBalance ? parseFloat(closingBalance) : 0,
      },
    });

    res.status(201).json({ message: 'Customer created successfully', customer });
  } catch (error) {
    console.error('Error creating customer:', error);

    // Handle unique constraint violation
    if (error.code === 'P2002' && error.meta?.target.includes('phoneNumber')) {
      return res.status(400).json({ message: 'Phone number must be unique.' });
    }

    res.status(500).json({ message: 'Internal server error' });
  }
};


module.exports = { createCustomer };