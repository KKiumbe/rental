const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();





const getCustomerDetails = async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user;

  // Validate inputs
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Valid Customer ID is required' });
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
        unitId: true,
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
            building: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
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
                quantity: true,
                amount: true,
               
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10, // Limit for performance
        },
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            transactionCode: true,
            amount: true,
            paidBy: true,
           
            createdAt: true,
           
            payment: {
              select: {
                id: true,
                modeOfPayment: true,
                transactionId: true,
                amount: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        payments: {
          select: {
            id: true,
            modeOfPayment: true,
            transactionId: true,
            amount: true,
            createdAt: true,
          
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        deposits: {
          select: {
            id: true,
            amount: true,
            
            invoiceId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        gasConsumptions: {
          select: {
            id: true,
            period: true,
            consumption: true,
            reading: true,
          
            createdAt: true,
          },
          orderBy: { period: 'desc' },
          take: 10,
        },
        waterConsumptions: {
          select: {
            id: true,
            period: true,
            consumption: true,
            reading: true,
           
            createdAt: true,
          },
          orderBy: { period: 'desc' },
          take: 10,
        },
       
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or does not belong to this tenant' });
    }

    // Format response
    const formattedCustomer = {
      ...customer,
      fullName: `${customer.firstName} ${customer.lastName}`.trim(),
      unitName: customer.unit ? customer.unit.unitNumber : null,
      buildingName: customer.unit?.building ? customer.unit.building.name : null,
      hasLease: !!customer.leaseFileUrl,
      leaseStatus: customer.leaseEndDate
        ? new Date(customer.leaseEndDate) < new Date()
          ? 'EXPIRED'
          : 'ACTIVE'
        : null,
      leaseStartDate: customer.leaseStartDate ? customer.leaseStartDate.toISOString() : null,
      leaseEndDate: customer.leaseEndDate ? customer.leaseEndDate.toISOString() : null,
      unit: customer.unit
        ? {
            ...customer.unit,
            buildingName: customer.unit.building ? customer.unit.building.name : null,
            buildingAddress: customer.unit.building ? customer.unit.building.address : null,
          }
        : null,
     
    };

    res.status(200).json(formattedCustomer);
  } catch (error) {
    console.error('Error retrieving customer details:', {
      error: error.message,
      stack: error.stack,
      customerId: id,
      tenantId,
    });

    if (error.name === 'PrismaClientKnownRequestError') {
      if (error.code === 'P2025') {
        return res.status(404).json({ message: 'Customer not found' });
      }
      return res.status(400).json({ message: 'Invalid database request', error: error.message });
    }

    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};






const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params; // Get customer ID from URL params
    const tenantId = req.user?.tenantId; // Get tenantId from authenticated user

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID is required' });
    }

    // Start a Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check if the customer exists and belongs to the tenant
      const customer = await tx.customer.findFirst({
        where: {
          id,
          tenantId,
        },
        select: {
          id: true,
          unitId: true,
        },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // If the customer is assigned to a unit, mark the unit as VACANT
      if (customer.unitId) {
        const unit = await tx.unit.findUnique({
          where: { id: customer.unitId },
        });

        if (unit) {
          await tx.unit.update({
            where: { id: customer.unitId },
            data: { status: 'VACANT' },
          });
        } else {
          console.warn(`Unit with ID ${customer.unitId} not found for customer ${id}`);
        }
      }

      // Delete the customer
      await tx.customer.delete({
        where: { id },
      });

      return { message: 'Customer deleted successfully' };
    });

    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error deleting customer:', error);
    if (error.message === 'Customer not found' || error.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};



module.exports = {
  getCustomerDetails,
  deleteCustomer,
};
