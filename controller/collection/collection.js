const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get all customers by collection day and tenantId
 */
const getCollections = async (req, res) => {
  try {
    const { day } = req.query; // Expecting 'day' as a query parameter (e.g., MONDAY)
    const { tenantId } = req.user;

    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId, // Filter by tenant ID
        garbageCollectionDay: day ? day.toUpperCase() : undefined,
      },
    });

    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Error fetching customers.' });
  }
};

/**
 * Mark a customer as collected
 */



const markCustomerAsCollected = async (req, res) => {
  const { customerId } = req.params;
  const { tenantId, user } = req.user;
 // Assuming user ID is available in the request
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or does not belong to this tenant.' });
    }

    const [updatedCustomer] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customerId },
        data: { collected: true },
      }),
      prisma.GarbageCollection.create({ // Use uppercase G and C
        data: {
          tenantId,
          customerId,
          collectedBy: user || null,
          collectionDate: new Date(),
          notes: 'Garbage collected via API',
        },
      }),
    ]);

    res.json({
      message: 'Customer marked as collected and history updated.',
      customer: updatedCustomer,
    });
  } catch (error) {
    console.error('Error marking customer as collected:', error);
    res.status(500).json({ error: 'Error marking customer as collected.' });
  } finally {
    await prisma.$disconnect();
  }
};





/**
 * Filter customers by collection day
 */
const filterCustomersByDay = async (req, res) => {
  const { day } = req.query; // Expecting 'day' as a query parameter (e.g., MONDAY)
  const { tenantId } = req.user;

  try {
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId, // Filter by tenant ID
        garbageCollectionDay: day ? day.toUpperCase() : undefined,
      },
    });

    res.json(customers);
  } catch (error) {
    console.error('Error filtering customers:', error);
    res.status(500).json({ error: 'Error filtering customers.' });
  }
};

module.exports = {
  getCollections,
  markCustomerAsCollected,
  filterCustomersByDay,
};
