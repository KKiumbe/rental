const { PrismaClient, UnitStatus  } = require('@prisma/client');
const prisma = new PrismaClient();



const createBuilding = async (req, res) => {
    const { tenantId } = req.user; // Extract tenantId from authenticated user
  const {landlordId, name, address, unitCount, gasRate, waterRate } = req.body;

  // Validate required fields
  if (!tenantId || !landlordId || !name) {
    return res.status(400).json({ message: 'Required fields: tenantId, landlordId, name.' });
  }

  // Validate numeric fields
  if (unitCount !== undefined && (isNaN(unitCount) || unitCount < 0)) {
    return res.status(400).json({ message: 'unitCount must be a non-negative number.' });
  }
  if (gasRate !== undefined && (isNaN(gasRate) || gasRate < 0)) {
    return res.status(400).json({ message: 'gasRate must be a non-negative number.' });
  }
  if (waterRate !== undefined && (isNaN(waterRate) || waterRate < 0)) {
    return res.status(400).json({ message: 'waterRate must be a non-negative number.' });
  }

  try {
    // Check if tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found.' });
    }

    // Check if authenticated user belongs to the tenant
    if (req.user.tenantId !== tenantId) {
      return res.status(403).json({ message: 'User does not belong to the specified tenant.' });
    }

    // Check if landlord exists
    const landlord = await prisma.landlord.findUnique({
      where: { id: landlordId },
    });

    if (!landlord || landlord.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Landlord not found or does not belong to tenant.' });
    }

    // Create building
    const building = await prisma.building.create({
      data: {
        tenantId,
        landlordId,
        name,
        address,
        unitCount: unitCount ? parseInt(unitCount) : null,
        gasRate: gasRate ? parseFloat(gasRate) : null,
        waterRate: waterRate ? parseFloat(waterRate) : null,
      },
    });

    res.status(201).json({ message: 'Building created successfully', building });
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};



const createUnit = async (req, res) => {
  const { tenantId, user } = req.user; // Extract tenantId and user ID from authenticated user
  const { buildingId, unitNumber, monthlyCharge, depositAmount, garbageCharge, serviceCharge, status } = req.body;

  // Validate required fields
  if (!tenantId || !buildingId || !unitNumber || monthlyCharge == null || depositAmount == null) {
    return res.status(400).json({
      success: false,
      message: 'Required fields: tenantId, buildingId, unitNumber, monthlyCharge, depositAmount.',
    });
  }

  // Validate monthlyCharge and depositAmount
  if (monthlyCharge < 0 || depositAmount < 0) {
    return res.status(400).json({
      success: false,
      message: 'monthlyCharge and depositAmount must be non-negative.',
    });
  }

  // Validate optional charges
  if (garbageCharge != null && garbageCharge < 0) {
    return res.status(400).json({
      success: false,
      message: 'garbageCharge must be non-negative.',
    });
  }
  if (serviceCharge != null && serviceCharge < 0) {
    return res.status(400).json({
      success: false,
      message: 'serviceCharge must be non-negative.',
    });
  }

  // Validate status
  const validStatuses = Object.values(UnitStatus);
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

    // Check if building exists and belongs to the tenant
    const building = await prisma.building.findUnique({
      where: { id: buildingId },
    });
    if (!building || building.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Building not found or does not belong to the tenant.',
      });
    }

    // Check for duplicate unitNumber within the building
    const existingUnit = await prisma.unit.findFirst({
      where: {
        buildingId,
        unitNumber,
      },
    });
    if (existingUnit) {
      return res.status(400).json({
        success: false,
        message: `Unit number ${unitNumber} already exists in this building.`,
      });
    }

    // Create unit
    const unit = await prisma.unit.create({
      data: {
        tenantId,
        buildingId,
        unitNumber,
        monthlyCharge,
        depositAmount,
        garbageCharge: garbageCharge || null,
        serviceCharge: serviceCharge || null,
        status: status || 'VACANT',
      },
    });

    // Update building unitCount
    await prisma.building.update({
      where: { id: buildingId },
      data: { unitCount: { increment: 1 } },
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `CREATED UNIT ${unitNumber} IN BUILDING ${building.name}`,
        timestamp: new Date(),
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Unit created successfully',
      data: unit,
    });
  } catch (error) {
    console.error('Error creating unit:', error);

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (target?.includes('unitNumber')) {
        return res.status(400).json({
          success: false,
          message: `Unit number ${unitNumber} already exists in this building.`,
        });
      }
    }

    // Handle Prisma validation error
    if (error.name === 'PrismaClientValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided for unit creation.',
      });
    }

    // Handle relation errors
    if (error.code === 'P2025') {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant, user, or building reference.',
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







const searchBuildings = async (req, res) => {
  const { query } = req.query; // e.g., "Sunset"
  const { tenantId } = req.user;

  if (!query) {
    return res.status(400).json({ message: 'Query parameter is required.' });
  }

  try {
    const buildings = await prisma.building.findMany({
      where: {
        tenantId,
        name: { contains: query, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        address: true,
        unitCount: true,
        landlord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 10, // Limit results
    });

    res.status(200).json({ message: 'Buildings retrieved successfully', buildings });
  } catch (error) {
    console.error('Error searching buildings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};



module.exports = { createBuilding, searchBuildings ,createUnit};
