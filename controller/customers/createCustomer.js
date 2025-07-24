const { PrismaClient, CustomerStatus } = require('@prisma/client');
const prisma = new PrismaClient();




const createCustomer = async (req, res) => {
  const { tenantId, id: userId , role, firstName: userFirstName, lastName: userLastName} = req.user;
  const {
    buildingId,
    firstName,
    lastName,
    email,
    phoneNumber,
    secondaryPhoneNumber,
    houseNumber,
    unitId,
    garbageCharge,
    serviceCharge,
    closingBalance,
    status,
  } = req.body;


  console.log(`object ${JSON.stringify(req.body)}`);


  if (!tenantId || !buildingId || !firstName || !lastName || !phoneNumber || !unitId) {
    return res.status(400).json({
      message: 'Required fields: tenantId, buildingId, firstName, lastName, phoneNumber, unitId.',
    });
  }

  const validStatuses = ['ACTIVE', 'INACTIVE'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
    });
  }

  const numericFields = { garbageCharge, serviceCharge, closingBalance };
  for (const [field, value] of Object.entries(numericFields)) {
    if (value !== undefined && (isNaN(value) || value < 0)) {
      return res.status(400).json({ message: `${field} must be a non-negative number.` });
    }
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

   

    const building = await prisma.building.findUnique({ where: { id: buildingId } });
    if (!building || building.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Building not found or does not belong to tenant.' });
    }

    const existingCustomer = await prisma.customer.findUnique({
      where: { phoneNumber },
    });

    if (existingCustomer && existingCustomer.tenantId === tenantId) {
      return res.status(400).json({ message: 'Phone number already exists for this tenant.' });
    }

    // Fetch unit to ensure it exists and belongs to the tenant
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit || unit.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Unit not found or does not belong to tenant.' });
    }

    // Create customer
  const customer = await prisma.customer.create({
  data: {
    tenantId: tenantId,
    firstName: firstName,
    lastName: lastName,
    email: email,
    phoneNumber: phoneNumber,
    secondaryPhoneNumber: secondaryPhoneNumber,
    
    status: status,
    closingBalance: closingBalance,
    Building: {
      connect: {
        id: buildingId
      }
    },
    unitId
  }
}); 


    // Create CustomerUnit link
    await prisma.customerUnit.create({
      data: {
        customerId: customer.id,
        unitId: unitId,
        isActive: true,
        startDate: new Date(),
      },
    });

    // Update unit to OCCUPIED
    await prisma.unit.update({
      where: { id: unitId },
      data: { status: 'OCCUPIED' },
    });

    // Log user activity
    // await prisma.userActivity.create({
    //   data: {
    //     user: { connect: { id: userId } },
    //     tenant: { connect: { id: tenantId } },
    //     customer: { connect: { id: customer.id } },
    //     action: `Added customer ${userFirstName} ${userLastName} to unit ${unitId}`,
    //     timestamp: new Date(),
    //   },
    // });

    return res.status(201).json({
      success: true,
      message: 'Customer created and linked to unit successfully',
      data: customer,
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    if (error.code === 'P2002' && error.meta?.target.includes('phoneNumber')) {
      return res.status(400).json({ message: 'Phone number must be unique.' });
    }
    return res.status(500).json({ message: 'Internal server error' });
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
      select: { tenantId: true, firstName: true, lastName: true ,id:true},
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

    // if (customer.unit.status !== UnitStatus.OCCUPIED_PENDING_PAYMENT) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Unit is not in OCCUPIED_PENDING_PAYMENT status.',
    //   });
    // }

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
    user: { connect: { id: currentUser.id } },
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

async function getCustomerDeposits(req, res) {
  const { id:customerId } = req.params;
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(403).json({ error: "Tenant ID is required to fetch deposits" });
  }

  if (!customerId) {
    return res.status(400).json({ error: "Customer ID is required" });
  }

  try {
    // Fetch deposits for the customer
    const deposits = await prisma.deposit.findMany({
      where: {
        customerId,
        tenantId,
      },
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        refundedAt: true,
        //refundAmount: true,
        deductionReason: true,
        refundTransactionId: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            invoiceAmount: true,
            amountPaid: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ deposits });
  } catch (error) {
    console.error("Error fetching deposits:", error);
    res.status(500).json({ error: "Internal server error while fetching deposits" });
  }
}





async function getCustomersByUnitId(req, res) {
  const { unitId } = req.params;
  const tenantId = req.user?.tenantId;  // Multi-tenant isolation

  if (!tenantId) {
    return res.status(401).json({ success: false, message: 'Unauthorized: tenant not identified.' });
  }

  try {
    // Check if unit exists under tenant
    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        tenantId
      }
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found.' });
    }

    // Get customers linked to this unit + tenant
    const customers = await prisma.customer.findMany({
      where: {
        unitId: unitId,
        tenantId: tenantId
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        secondaryPhoneNumber: true,
        nationalId: true,
        status: true,
        leaseStartDate: true,
        leaseEndDate: true,
        closingBalance: true
      }
    });

    return res.json({
      success: true,
      data: customers
    });

  } catch (error) {
    console.error('Error fetching customers by unit ID:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}




module.exports = { createCustomer, activateCustomer,getCustomerDeposits,createCustomer, getCustomerDeposits };




