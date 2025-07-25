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
      include: {
        // Include all units through CustomerUnit relationship
        CustomerUnit: {
          where: {
            isActive: true
          },
          include: {
            unit: {
              include: {
                building: {
                  include: {
                    landlord: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phoneNumber: true
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            startDate: 'desc'
          }
        },
        // Include the direct unit relationship for backward compatibility
        unit: {
          include: {
            building: {
              include: {
                landlord: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true
                  }
                }
              }
            }
          }
        },
        // Include payments through receipts
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            createdAt: true,
            payment: {
              select: {
                id: true,
                modeOfPayment: true,
                transactionId: true,
                amount: true,
                createdAt: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceAmount: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            InvoiceItem: {
              select: {
                id: true,
                description: true,
                amount: true,
                quantity: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        deposits: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        gasConsumptions: {
          select: {
            id: true,
            period: true,
            consumption: true,
            reading: true,
            createdAt: true
          },
          orderBy: { period: 'desc' },
          take: 10
        },
        waterConsumptions: {
          select: {
            id: true,
            period: true,
            consumption: true,
            reading: true,
            createdAt: true
          },
          orderBy: { period: 'desc' },
          take: 10
        }
      }
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or does not belong to this tenant' });
    }

    // Combine both unit relationships (direct and through CustomerUnit)
    const allUnits = [
      ...(customer.unit ? [{
        ...customer.unit,
        isPrimary: true,
        startDate: customer.leaseStartDate,
        endDate: customer.leaseEndDate,
        relationshipId: null
      }] : []),
      ...customer.CustomerUnit.map(cu => ({
        ...cu.unit,
        isPrimary: false,
        startDate: cu.startDate,
        endDate: cu.endDate,
        isActive: cu.isActive,
        relationshipId: cu.id
      }))
    ];

    // Format payments from receipts
    const payments = customer.receipts.map(receipt => ({
      ...receipt.payment,
      receiptNumber: receipt.receiptNumber
    }));

    // Format the response
    const formattedCustomer = {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      secondaryPhoneNumber: customer.secondaryPhoneNumber,
      nationalId: customer.nationalId,
      status: customer.status,
      closingBalance: customer.closingBalance,
      leaseFileUrl: customer.leaseFileUrl,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      fullName: `${customer.firstName} ${customer.lastName}`.trim(),
      hasLease: !!customer.leaseFileUrl,
      leaseStatus: customer.leaseEndDate
        ? new Date(customer.leaseEndDate) < new Date()
          ? 'EXPIRED'
          : 'ACTIVE'
        : null,
      leaseStartDate: customer.leaseStartDate?.toISOString() || null,
      leaseEndDate: customer.leaseEndDate?.toISOString() || null,
      units: allUnits.map(unit => ({
        id: unit.id,
        unitNumber: unit.unitNumber,
        monthlyCharge: unit.monthlyCharge,
        depositAmount: unit.depositAmount,
        status: unit.status,
        isPrimary: unit.isPrimary,
        isActive: unit.isActive,
        relationshipId: unit.relationshipId,
        startDate: unit.startDate?.toISOString() || null,
        endDate: unit.endDate?.toISOString() || null,
        building: {
          id: unit.building.id,
          name: unit.building.name,
          address: unit.building.address,
          landlord: unit.building.landlord
        }
      })),
      invoices: customer.invoices,
      payments: payments,
      deposits: customer.deposits,
      gasConsumptions: customer.gasConsumptions,
      waterConsumptions: customer.waterConsumptions
    };

    res.status(200).json(formattedCustomer);
  } catch (error) {
    console.error('Error retrieving customer details:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
};


async function deleteCustomer(req, res) {
  try {
    const { id: customerId } = req.params;
    const { userId } = req.user || {};

    if (!customerId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: customerId and userId'
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        CustomerUnit: true,
        unit: true
      }
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentLink.deleteMany({ where: { customerId } });

      const receipts = await tx.receipt.findMany({
        where: { customerId },
        select: { id: true, paymentId: true }
      });

      for (const receipt of receipts) {
        await tx.receiptInvoice.deleteMany({ where: { receiptId: receipt.id } });
        await tx.receipt.delete({ where: { id: receipt.id } });
        if (receipt.paymentId) {
          await tx.payment.delete({ where: { id: receipt.paymentId } });
        }
      }

      const invoices = await tx.invoice.findMany({
        where: { customerId },
        select: { id: true }
      });

      for (const invoice of invoices) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
        await tx.receiptInvoice.deleteMany({ where: { invoiceId: invoice.id } });
        await tx.invoice.delete({ where: { id: invoice.id } });
      }

      await tx.deposit.deleteMany({ where: { customerId } });
      await tx.gasConsumption.deleteMany({ where: { customerId } });
      await tx.waterConsumption.deleteMany({ where: { customerId } });
      await tx.powerConsumption.deleteMany({ where: { customerId } });
      await tx.abnormalWaterReading.deleteMany({ where: { customerId } });
      await tx.leaseTermination.deleteMany({ where: { customerId } });

      const taskAssignees = await tx.taskAssignee.findMany({
        where: { Customer: { some: { id: customerId } } },
        select: { id: true }
      });

      for (const assignee of taskAssignees) {
        await tx.taskAssignee.update({
          where: { id: assignee.id },
          data: { Customer: { disconnect: { id: customerId } } }
        });
      }

      // Get all units linked to this customer
      const customerUnits = await tx.customerUnit.findMany({
        where: { customerId },
        select: { unitId: true }
      });

      // Delete customer-unit relationships
      await tx.customerUnit.deleteMany({ where: { customerId } });

      // Mark those units as VACANT if no other active customers remain
      for (const { unitId } of customerUnits) {
        const activeOccupants = await tx.customerUnit.count({
          where: {
            unitId,
            isActive: true
          }
        });

        if (activeOccupants === 0) {
          await tx.unit.update({
            where: { id: unitId },
            data: { status: 'VACANT' }
          });
        }
      }

      const buildings = await tx.building.findMany({
        where: { Customer: { some: { id: customerId } } },
        select: { id: true }
      });

      for (const building of buildings) {
        await tx.building.update({
          where: { id: building.id },
          data: { Customer: { disconnect: { id: customerId } } }
        });
      }

      // Handle unitId field in Customer model
      if (customer.unitId) {
        const unitOccupants = await tx.customerUnit.count({
          where: { unitId: customer.unitId, isActive: true }
        });

        if (unitOccupants === 0) {
          await tx.unit.update({
            where: { id: customer.unitId },
            data: { status: 'VACANT' }
          });
        }
      }

      await tx.auditLog.deleteMany({ where: { customerId } });
      await tx.userActivity.deleteMany({ where: { customerId } });

      await tx.customer.delete({ where: { id: customerId } });

      await tx.auditLog.create({
        data: {
          tenantId: customer.tenantId,
          userId,
          action: 'CUSTOMER_DELETION',
          resource: 'Customer',
          details: JSON.stringify({
            customerId,
            customerName: `${customer.firstName} ${customer.lastName}`,
            deletedAt: new Date()
          })
        }
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Customer deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteCustomer:', error);

    if (error.code === 'P2003') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete customer due to related records. Remove dependencies first.',
        error: error.meta?.constraint
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  } finally {
    await prisma.$disconnect();
  }
}






module.exports = {
  getCustomerDetails,
  deleteCustomer,
};
