const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();




const getAllCustomers = async (req, res) => {
  try {
    

 
    const customers = await prisma.customer.findMany({
      where: {
        tenantId: req.user.tenantId,
      },
      include: {
        CustomerUnit: {
          include: {
            unit: {
              include: {
                building: true, // brings in building name and ID
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({customers});
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
};



module.exports = { getAllCustomers };