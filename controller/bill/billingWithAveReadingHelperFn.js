const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getBillingWithAveragesStatus({ customerId, tenantId }) {
  // Validate inputs
  if (!customerId || !tenantId) {
    throw new Error('Missing required parameters: customerId and tenantId are required.');
  }

  // Fetch the customer with their unit and building
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      unit: {
        include: {
          building: {
            select: {
              allowWaterBillingWithAverages: true,
              allowGasBillingWithAverages: true, // Include gas billing status
            },
          },
        },
      },
    },
  });

  if (!customer || customer.tenantId !== tenantId) {
    throw new Error('Customer not found or does not belong to this tenant.');
  }

  if (!customer.unit || !customer.unit.building) {
    throw new Error('Customer is not assigned to a unit or building.');
  }

  return {
    allowWaterBillingWithAverages: customer.unit.building.allowWaterBillingWithAverages,
    allowGasBillingWithAverages: customer.unit.building.allowGasBillingWithAverages,
  };
}

module.exports = { getBillingWithAveragesStatus };