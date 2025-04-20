const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const getAllCustomers = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Get pagination params (default: page=1, limit=10)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch total count (for pagination)
    const totalCustomers = await prisma.customer.count({
      where: { tenantId },
    });

    // Fetch paginated customers with unit and building data
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      skip,
      take: limit,
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

    // Format response
    res.status(200).json({
      customers: customers.map((customer) => ({
        ...customer,
        buildingName: customer.unit?.building?.name || null, // Handle cases with no unit
      })),
      total: totalCustomers,
      currentPage: page,
      totalPages: Math.ceil(totalCustomers / limit),
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { getAllCustomers };