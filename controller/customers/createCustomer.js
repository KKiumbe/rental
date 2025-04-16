const { PrismaClient, CustomerStatus, UnitStatus } = require('@prisma/client');

const prisma = new PrismaClient();

const createCustomer = async (req, res) => {
  const { tenantId, user } = req.user; // Extract tenantId and user ID
  const {
    unitId,
    firstName,
    lastName,
    email,
    phoneNumber,
    secondaryPhoneNumber,
    nationalId,
   
  } = req.body;

  // Validate required fields
  if (!tenantId || !unitId || !firstName || !lastName || !phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Required fields: tenantId, unitId, firstName, lastName, phoneNumber.',
    });
  }

  // Validate status
  const validStatuses = Object.values(CustomerStatus);
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
    });
  }

  try {
    // Check if tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found.',
      });
    }

    // Check if authenticated user exists and belongs to the tenant
    const currentUser = await prisma.user.findUnique({
      where: { id: user },
      select: { tenantId: true, firstName: true, lastName: true },
    });
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Authenticated user not found.',
      });
    }
    if (currentUser.tenantId !== tenantId) {
      return res.status(403).json({
        success: false,
        message: 'User does not belong to the specified tenant.',
      });
    }

    // Check if unit exists, belongs to tenant, and is vacant
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });
    if (!unit || unit.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found or does not belong to the tenant.',
      });
    }
    if (unit.status !== 'VACANT') {
      return res.status(400).json({
        success: false,
        message: 'Unit is not available (must be VACANT).',
      });
    }

    // Check for duplicate phone number or national ID
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        tenantId,
        OR: [
          { phoneNumber },
          nationalId ? { nationalId } : {},
        ],
      },
    });
    if (existingCustomer) {
      const conflictField = existingCustomer.phoneNumber === phoneNumber ? 'phone number' : 'national ID';
      return res.status(400).json({
        success: false,
        message: `A customer with this ${conflictField} already exists for this tenant.`,
      });
    }

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        unitId,
        firstName,
        lastName,
        email: email || null,
        phoneNumber,
        secondaryPhoneNumber: secondaryPhoneNumber || null,
        nationalId: nationalId || null,
        status:CustomerStatus.PENDING, // Default status
        closingBalance: 0, // Default per schema
      },
    });

    // Update unit status to OCCUPIED
    await prisma.unit.update({
      where: { id: unitId },
      data: { status: 'OCCUPIED' },
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Added customer ${firstName} ${lastName} to unit ${unitId}`,
        timestamp: new Date(),
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer,
    });
  } catch (error) {
    console.error('Error creating customer:', error);

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      const field = target?.includes('phoneNumber') ? 'phone number' : 'national ID';
      return res.status(400).json({
        success: false,
        message: `The ${field} must be unique.`,
      });
    }

    // Handle Prisma validation error
    if (error.name === 'PrismaClientValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided for customer creation.',
      });
    }

    // Handle relation errors
    if (error.code === 'P2025') {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant, user, or unit reference.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  } finally {
    await prisma.$disconnect();
  }
};






const activateCustomer = async (req, res) => {
  const { tenantId, user } = req.user;
  const { customerId } = req.body;

  // Validate input
  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Required field: customerId',
    });
  }

  try {
    // Validate tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found.',
      });
    }

    // Validate user (assume admin role check in middleware)
    const currentUser = await prisma.user.findUnique({
      where: { id: user },
      select: { tenantId: true, firstName: true, lastName: true },
    });
    if (!currentUser || currentUser.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Authenticated user not found or does not belong to tenant.',
      });
    }

    // Validate customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { unit: true, invoices: true },
    });
    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or does not belong to tenant.',
      });
    }
    if (customer.status !== CustomerStatus.PENDING) {
      return res.status(400).json({
        success: false,
        message: 'Customer must be in PENDING status to activate.',
      });
    }
    if (!customer.unitId || !customer.unit) {
      return res.status(400).json({
        success: false,
        message: 'Customer is not assigned to a unit.',
      });
    }
    if (customer.unit.status !== UnitStatus.OCCUPIED_PENDING_PAYMENT) {
      return res.status(400).json({
        success: false,
        message: 'Unit is not in OCCUPIED_PENDING_PAYMENT status.',
      });
    }

 

    // Verify all invoices are PAID
    const unpaidInvoices = customer.invoices.filter(
      (invoice) => invoice.status !== 'PAID'
    );
    if (unpaidInvoices.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Customer has ${unpaidInvoices.length} unpaid or partially paid invoice(s). All invoices must be paid before activation.`,
      });
    }

 

    // Update customer and unit status
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        status: CustomerStatus.ACTIVE,
        unit: {
          update: {
            status: UnitStatus.OCCUPIED,
          },
        },
      },
      include: { unit: true },
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Activated customer ${customerId} to ACTIVE status by ${currentUser.firstName} ${currentUser.lastName}`,
        timestamp: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Customer activated successfully',
      data: updatedCustomer,
    });
  } catch (error) {
    console.error('Error activating customer:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  } finally {
    await prisma.$disconnect();
  }
};



module.exports = { createCustomer, activateCustomer };