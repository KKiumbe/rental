const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// PUT: Update a customer



// GET /units/:id/customers
const getUnitCustomers = async (req, res) => {
  const unitId = req.params.id;
  const tenantId = req.user?.tenantId;

  try {
    const customers = await prisma.customer.findMany({
      where: {
        unitId,
        tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        status: true,
      },
    });

    return res.status(200).json({ success: true, data: customers });
  } catch (error) {
    console.error('Error fetching customers for unit:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customers for this unit.' });
  }
};





const editCustomer = async (req, res) => {
  const customerId = req.params.id; // UUID string
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    secondaryPhoneNumber,
    nationalId,
    status,
    closingBalance,
  } = req.body;

  // Extract tenantId and userId from the authenticated user
  const {tenantId} = req.user;
  const {userId} = req.user;

  // Validate inputs
  if (!customerId) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  // Verify the current user
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, tenantId: true, id: true },
  });
  if (!currentUser) {
    return res.status(404).json({ message: 'Authenticated user not found' });
  }
  if (currentUser.tenantId !== tenantId) {
    return res.status(403).json({ message: 'User does not belong to the specified tenant' });
  }

  try {
    // Ensure the customer exists and belongs to the tenant
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or access denied' });
    }

    // Create update data with only provided fields
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (secondaryPhoneNumber !== undefined) updateData.secondaryPhoneNumber = secondaryPhoneNumber;
    if (nationalId !== undefined) updateData.nationalId = nationalId;
    if (status !== undefined) updateData.status = status;
    if (closingBalance !== undefined) updateData.closingBalance = parseFloat(closingBalance) || null;

    // Ensure at least one field is provided
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'At least one field must be provided for update' });
    }

    // Track changed fields for UserActivity
    const changedFields = Object.keys(updateData).map((key) => ({
      field: key,
      oldValue: customer[key] !== undefined ? customer[key] : null,
      newValue: updateData[key],
    }));

    // Update the customer
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: updateData,
    });

    // Log the user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: currentUser.id } },
        tenant: { connect: { id: tenantId } },
        customer: { connect: { id: customerId } },
        action: 'UPDATED_CUSTOMER',
        details: { changedFields },
        timestamp: new Date(),
      },
    });

    // Return the updated customer
    res.status(200).json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Phone number or national ID already exists' });
    }
    if (error.code === 'P2025') {
      return res.status(400).json({ message: 'Invalid record not found' });
    }
    res.status(500).json({ message: 'Error updating customer' });
  }
};





module.exports = { editCustomer, getUnitCustomers };