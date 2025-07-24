const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


 
async function assignUnitToCustomer(req, res) {
  try {
    const { customerId, unitId } = req.body;
    const { userId } = req.user || {};

    if (!customerId || !unitId) {
      return res.status(400).json({ message: 'Missing customerId or unitId' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

    // Check if already assigned and active
    const existingAssignment = await prisma.customerUnit.findFirst({
      where: {
        customerId,
        unitId,
        isActive: true,
      },
    });

    if (existingAssignment) {
      return res.status(409).json({ message: 'This unit is already assigned to the customer' });
    }

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      const customerUnit = await tx.customerUnit.create({
        data: {
          customerId,
          unitId,
          isActive: true,
          startDate: new Date(),
        },
      });

      if (unit.status === 'VACANT') {
        await tx.unit.update({
          where: { id: unitId },
          data: { status: 'OCCUPIED' },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: customer.tenantId,
          userId: userId,
          action: 'UNIT_ASSIGNMENT',
          resource: 'CustomerUnit',
          customerId,
          details: JSON.stringify({
            unitId,
            startDate: customerUnit.startDate,
            endDate: customerUnit.endDate,
          }),
        },
      });

      return customerUnit;
    });

    return res.status(200).json({
      message: 'Unit assigned to customer successfully',
      assignment: result,
    });

  } catch (error) {
    console.error('Error in assignUnitToCustomer:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}



async function getCustomerUnits(req,res) {
    try {
        
        const { id: customerId } = req.params;
        const { userId } = req.user || {};

        if (!customerId) {
            return res.status(400).json({ message: 'Missing customerId' });
        }
        if(!userId){
            return res.status(401).json({ message: 'Not authorized' });
        }

        const customerUnits = await prisma.customerUnit.findMany({
            where: {
                customerId,
            },
            include: {
                unit: {
                    include: {
                        building: true,
                    },
                },
            },
            orderBy: {
                isActive: 'desc', // Active units first
            },
        });

        res.status(200).json(customerUnits);

        return customerUnits;
    } catch (error) {
        console.error('Error in getCustomerUnits:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}




module.exports = { assignUnitToCustomer, getCustomerUnits };