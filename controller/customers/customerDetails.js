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





async function deleteCustomer(req, res) {
    try {

      const { id:customerId } = req.params;
        const { userId } = req.user || {};

        if (!customerId || !userId) {
            throw new Error('Missing required parameters: customerId and userId are required');
        }

        // First, get the customer to verify existence and get tenantId
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                CustomerUnit: true,
                unit: true
            }
        });

        if (!customer) {
            throw new Error('Customer not found');
        }

        // Start transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Delete all payment links first
            await tx.paymentLink.deleteMany({
                where: { customerId }
            });

            // 2. Delete receipts and related records
            const receipts = await tx.receipt.findMany({
                where: { customerId },
                select: { id: true, paymentId: true }
            });

            for (const receipt of receipts) {
                await tx.receiptInvoice.deleteMany({
                    where: { receiptId: receipt.id }
                });

                await tx.receipt.delete({
                    where: { id: receipt.id }
                });

                await tx.payment.delete({
                    where: { id: receipt.paymentId }
                });
            }

            // 3. Handle invoices and related records
            const invoices = await tx.invoice.findMany({
                where: { customerId },
                select: { id: true }
            });

            for (const invoice of invoices) {
                await tx.invoiceItem.deleteMany({
                    where: { invoiceId: invoice.id }
                });

                await tx.receiptInvoice.deleteMany({
                    where: { invoiceId: invoice.id }
                });

                await tx.powerConsumption.updateMany({
                    where: { Invoice: { some: { id: invoice.id } } },
                    data: { Invoice: { disconnect: { id: invoice.id } } }
                });

                await tx.leaseTermination.updateMany({
                    where: { invoices: { some: { id: invoice.id } } },
                    data: { invoices: { disconnect: { id: invoice.id } } }
                });

                await tx.invoice.delete({
                    where: { id: invoice.id }
                });
            }

            // 4. Delete deposits
            await tx.deposit.deleteMany({
                where: { customerId }
            });

            // 5. Delete consumption records
            await tx.gasConsumption.deleteMany({
                where: { customerId }
            });

            await tx.waterConsumption.deleteMany({
                where: { customerId }
            });

            await tx.powerConsumption.deleteMany({
                where: { customerId }
            });

            await tx.abnormalWaterReading.deleteMany({
                where: { customerId }
            });

            // 6. Delete lease terminations
            await tx.leaseTermination.deleteMany({
                where: { customerId }
            });

            // 7. CORRECTED: Handle task assignees (many-to-many relation)
            // First find all task assignees that have this customer
            const taskAssignees = await tx.taskAssignee.findMany({
                where: {
                    Customer: {
                        some: { id: customerId }
                    }
                },
                select: { id: true }
            });

            // For each task assignee, disconnect the customer
            for (const assignee of taskAssignees) {
                await tx.taskAssignee.update({
                    where: { id: assignee.id },
                    data: {
                        Customer: {
                            disconnect: { id: customerId }
                        }
                    }
                });
            }

            // 8. Delete customer-unit relationships
            await tx.customerUnit.deleteMany({
                where: { customerId }
            });

            // 9. Update any buildings that reference this customer
            // First find buildings with this customer
            const buildings = await tx.building.findMany({
                where: {
                    Customer: {
                        some: { id: customerId }
                    }
                },
                select: { id: true }
            });

            // For each building, disconnect the customer
            for (const building of buildings) {
                await tx.building.update({
                    where: { id: building.id },
                    data: {
                        Customer: {
                            disconnect: { id: customerId }
                        }
                    }
                });
            }

            // 10. Update unit status if this customer was the only occupant
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

            // 11. Delete audit logs referencing this customer
            await tx.auditLog.deleteMany({
                where: { customerId }
            });

            // 12. Delete user activities referencing this customer
            await tx.userActivity.deleteMany({
                where: { customerId }
            });

            // Finally, delete the customer
            const deletedCustomer = await tx.customer.delete({
                where: { id: customerId }
            });

            // Create audit log for the deletion
            await tx.auditLog.create({
                data: {
                    tenantId: customer.tenantId,
                    userId: userId,
                    action: 'CUSTOMER_DELETION',
                    resource: 'Customer',
                    details: JSON.stringify({
                        customerId,
                        customerName: `${customer.firstName} ${customer.lastName}`,
                        deletedAt: new Date()
                    }),
                }
            });

            return deletedCustomer;
        });

        return result;
    } catch (error) {
        console.error('Error in deleteCustomer:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}






module.exports = {
  getCustomerDetails,
  deleteCustomer,
};
