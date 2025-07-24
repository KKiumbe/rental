const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();




const getCustomerDetails = async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user;

  if (!tenantId || !id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Valid customer ID and tenant ID are required' });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
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
        createdAt: true,
        updatedAt: true,

        unit: {
          select: {
            id: true,
            unitNumber: true,
            monthlyCharge: true,
            depositAmount: true,
            status: true,
            building: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },

        // invoices: {
        //   select: {
        //     id: true,
        //     invoiceNumber: true,
        //     invoiceAmount: true,
        //     status: true,
        //     createdAt: true,
        //     updatedAt: true,
        //     items: {
        //       select: {
        //         id: true,
        //         description: true,
        //         quantity: true,
        //         amount: true,
        //       },
        //     },
        //   },
        //   orderBy: { createdAt: 'desc' },
        //   take: 10,
        // },

        // receipts: {
        //   select: {
        //     id: true,
        //     receiptNumber: true,
        //     transactionCode: true,
        //     amount: true,
        //     paidBy: true,
        //     createdAt: true,
        //     payment: {
        //       select: {
        //         id: true,
        //         modeOfPayment: true,
        //         transactionId: true,
        //         amount: true,
        //         createdAt: true,
        //       },
        //     },
        //   },
        //   orderBy: { createdAt: 'desc' },
        //   take: 10,
        // },

        // payments: {
        //   select: {
        //     id: true,
        //     modeOfPayment: true,
        //     transactionId: true,
        //     amount: true,
        //     createdAt: true,
        //   },
        //   orderBy: { createdAt: 'desc' },
        //   take: 10,
        // },

        // deposits: {
        //   select: {
        //     id: true,
        //     amount: true,
        //     invoiceId: true,
        //     createdAt: true,
        //     updatedAt: true,
        //   },
        //   orderBy: { createdAt: 'desc' },
        //   take: 10,
        // },

        // gasConsumptions: {
        //   select: {
        //     id: true,
        //     period: true,
        //     consumption: true,
        //     reading: true,
        //     createdAt: true,
        //   },
        //   orderBy: { period: 'desc' },
        //   take: 10,
        // },

        // waterConsumptions: {
        //   select: {
        //     id: true,
        //     period: true,
        //     consumption: true,
        //     reading: true,
        //     createdAt: true,
        //   },
        //   orderBy: { period: 'desc' },
        //   take: 10,
        // },
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or does not belong to this tenant' });
    }

    const activeUnit = customer.unit;
    const unitInfo = activeUnit || {};

    const formattedCustomer = {
      ...customer,
      fullName: `${customer.firstName} ${customer.lastName}`.trim(),
      hasLease: !!customer.leaseFileUrl,
      leaseStatus: customer.leaseEndDate
        ? new Date(customer.leaseEndDate) < new Date()
          ? 'EXPIRED'
          : 'ACTIVE'
        : null,
      leaseStartDate: customer.leaseStartDate?.toISOString() || null,
      leaseEndDate: customer.leaseEndDate?.toISOString() || null,
      unit: {
        id: unitInfo.id,
        unitNumber: unitInfo.unitNumber,
        monthlyCharge: unitInfo.monthlyCharge,
        depositAmount: unitInfo.depositAmount,
        status: unitInfo.status,
        buildingName: unitInfo.building?.name || null,
        buildingAddress: unitInfo.building?.address || null,
      },
     //payments: customer.payments,
    };

    res.status(200).json(formattedCustomer);
  } catch (error) {
    console.error('Error retrieving customer details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};





const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenantId, userId } = req.user;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findFirst({
          where: {
            id,
            tenantId,
          },
          select: {
            id: true,
            unitId: true,
            firstName: true,
            lastName: true,
          },
        });

        if (!customer) {
          throw new Error('Customer not found');
        }

        const currentUser = await tx.user.findUnique({
          where: { id: userId },
          select: { tenantId: true, firstName: true, lastName: true, id: true },
        });

        if (!currentUser || currentUser.tenantId !== tenantId) {
          throw new Error('User does not belong to the specified tenant');
        }

        // Deactivate or delete associated CustomerUnit assignments
        await tx.customerUnit.updateMany({
          where: {
            customerId: id,
            isActive: true,
          },
          data: {
            isActive: false,
            endDate: new Date(),
          },
        });

        // Optional: delete those records entirely (if preferred over soft delete)
        // await tx.customerUnit.deleteMany({ where: { customerId: id } });

        // Mark unit as VACANT if needed
        if (customer.unitId) {
          await tx.unit.update({
            where: { id: customer.unitId },
            data: { status: 'VACANT' },
          });
        }

        await tx.userActivity.create({
          data: {
            user: { connect: { id: currentUser.id } },
            tenant: { connect: { id: tenantId } },
            action: `${customer.firstName} ${customer.lastName} DELETED by ${currentUser.firstName} ${currentUser.lastName}`,
            details: { customerId: customer.id },
            timestamp: new Date(),
          },
        });

        // Delete the customer
        await tx.customer.delete({
          where: { id },
        });

        return { message: 'Customer deleted successfully' };
      },
      { timeout: 10000 }
    );

    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error deleting customer:', error);

    if (error.message === 'Customer not found' || error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (error.code === 'P2028') {
      return res.status(500).json({
        success: false,
        message: 'Transaction timed out. Please try again or contact support.',
      });
    }

    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};




module.exports = {
  getCustomerDetails,
  deleteCustomer,
};
