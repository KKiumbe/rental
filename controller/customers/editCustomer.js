const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// PUT: Update a customer
const editCustomer = async (req, res) => {
  const customerId = req.params.id; // Keep as string for UUID
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    gender,
    county,
    town,
    status,
    location,
    estateName,
    building,
    houseNumber,
    category,
    monthlyCharge,
    garbageCollectionDay,
    collected,
    closingBalance,
  } = req.body;

  // Extract tenantId from the authenticated user (req.user)
  const tenantId = req.user?.tenantId;

  // Check if the customer ID and tenant ID are provided
  if (!customerId) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  try {
    // Ensure the customer belongs to the tenant before updating
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId, // Ensure the customer belongs to the correct tenant
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or access denied' });
    }

    // Create an object with only the provided fields
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (gender !== undefined) updateData.gender = gender;
    if (county !== undefined) updateData.county = county;
    if (town !== undefined) updateData.town = town;
    if (status !== undefined) updateData.status = status;
    if (location !== undefined) updateData.location = location;
    if (estateName !== undefined) updateData.estateName = estateName;
    if (building !== undefined) updateData.building = building;
    if (houseNumber !== undefined) updateData.houseNumber = houseNumber;
    if (category !== undefined) updateData.category = category;
    if (monthlyCharge !== undefined) updateData.monthlyCharge = monthlyCharge;
    if (garbageCollectionDay !== undefined) updateData.garbageCollectionDay = garbageCollectionDay;
    if (collected !== undefined) updateData.collected = collected;
    if (closingBalance !== undefined) updateData.closingBalance = closingBalance;

    // Ensure at least one field is provided for update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'At least one field must be provided for update' });
    }

    // Update the customer with only the provided fields
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: updateData,
    });

    // Return the updated customer data
    res.status(200).json(updatedCustomer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Error updating customer' });
  }
};

module.exports = { editCustomer };

