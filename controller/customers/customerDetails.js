const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getCustomerDetails = async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.user; // Get tenantId from the authenticated user

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        tenantId, // Ensure the customer belongs to the tenant
      },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: true, // Include invoice items
          },
        },
        receipts: {
          orderBy: { createdAt: 'desc' },
          include: {
            payment: true, // Include linked payment details
          },
        },

        GarbageCollection:{
          orderBy: { createdAt: 'desc' },

          select: { // Optionally select specific fields
            id: true,
            collectionDate: true,
            notes: true,
            collector:{
              select: {
                firstName: true,
                lastName: true,
              }
            },
            createdAt: true,
          },
        
        },

        trashbagsHistory: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            issuedDate: true,
            bagsIssued: true,
            taskId: true,
            issuedBy: {
              select: {
                assignee: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            createdAt: true,
          },
        },
 
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or does not belong to this tenant' });
    }

    res.status(200).json(customer);
  } catch (error) {
    console.error('Error retrieving customer details:', error);
    
    // If it's a Prisma-specific error, return a more detailed response
    if (error instanceof PrismaClientKnownRequestError) {
      return res.status(400).json({ message: 'Invalid request', error: error.message });
    }

    res.status(500).json({ message: 'Error retrieving customer details' });
  }
};




const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params; // Get customer ID from URL params
    const tenantId = req.user?.tenantId; // Get tenantId from authenticated user

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Check if the customer exists and belongs to the tenant
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Delete the customer
    await prisma.customer.delete({
      where: {
        id,
      },
    });

    res.status(200).json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    if (error.code === 'P2025') { // Prisma error for record not found (redundant check, but safe)
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect(); // Ensure Prisma disconnects
  }
};



module.exports = {
  getCustomerDetails,
  deleteCustomer,
};
