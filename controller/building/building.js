const { PrismaClient, UnitStatus  } = require('@prisma/client');
const prisma = new PrismaClient();




const getBuildingById = async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { buildingId:id } = req.params;

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  if (!id) {
    return res.status(400).json({ message: 'Building ID is required' });
  }

  try {
    const building = await prisma.building.findUnique({
      where: {
        id,
        tenantId, // Ensure building belongs to tenant
      },
      select: {
        id: true,
        tenantId: true,
        landlordId: true,
        name: true,
        address: true,
        unitCount: true,
        gasRate: true,
        waterRate: true,
        allowWaterBillingWithAverages: true,
        allowGasBillingWithAverages: true,
        billWater: true,
        billGas: true,
        billServiceCharge: true,
        billGarbage: true,
        billSecurity: true,
        billAmenities: true,
        billBackupGenerator: true,
      
     
        createdAt: true,
        updatedAt: true,
        landlord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        units: {
          select: {
            id: true,
            unitNumber: true,
            monthlyCharge: true,
            depositAmount: true,
            garbageCharge: true,
            serviceCharge: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            customers: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                secondaryPhoneNumber: true,
                nationalId: true,
                status: true,
                closingBalance: true,
                leaseFileUrl: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
          orderBy: { unitNumber: 'asc' }, // Sort units for consistency
        },
      },
    });

    if (!building) {
      return res.status(404).json({ message: 'Building not found' });
    }

    // Format response
    const formattedBuilding = {
      ...building,
      buildingName: building.name,
      landlord: building.landlord
        ? {
            ...building.landlord,
            name: `${building.landlord.firstName} ${building.landlord.lastName}`.trim(),
          }
        : null,
      units: building.units.map((unit) => ({
        ...unit,
        customerCount: unit.customers.length,
      })),
      customerCount: building.units.reduce((sum, unit) => sum + unit.customers.length, 0),
    };

    res.status(200).json(formattedBuilding);
  } catch (error) {
    console.error('Error fetching building:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Building not found' });
    }
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};




const editBuilding = async (req, res) => {
  const { tenantId, user } = req.user; // Extract tenantId and user ID
  const { buildingId: id } = req.params;
  const {
    name,
    address,
    unitCount,
    gasRate,
    waterRate,
    managementRate,
    billType,
    billWater,
    billGas,
    billServiceCharge,
    billGarbage,
    billSecurity,
    billAmenities,
    billBackupGenerator,
    allowWaterBillingWithAverages,
    allowGasBillingWithAverages,
  } = req.body;

  console.log(`this is the request body: ${JSON.stringify(req.body)}`);

  // Validate tenantId and buildingId
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  if (!id) {
    return res.status(400).json({ message: 'Building ID is required' });
  }

  // Validate required fields
  if (name !== undefined && !name) {
    return res.status(400).json({ message: 'Name is required if provided' });
  }

  // Validate billType if provided
  if (billType !== undefined && !['FULL', 'WATER_ONLY'].includes(billType)) {
    return res.status(400).json({ message: 'billType must be FULL or WATER_ONLY.' });
  }

  // Validate WATER_ONLY requirements if billType is provided
  if (billType === 'WATER_ONLY') {
    const existingBuilding = await prisma.building.findUnique({
      where: { id },
      select: { waterRate: true, billWater: true },
    });

    if (!existingBuilding) {
      return res.status(404).json({ message: 'Building not found' });
    }

    const effectiveBillWater = billWater !== undefined ? billWater : existingBuilding.billWater;
    const effectiveWaterRate = waterRate !== undefined ? waterRate : existingBuilding.waterRate;

    if (!effectiveBillWater) {
      return res.status(400).json({ message: 'billWater must be true for WATER_ONLY billing.' });
    }
    if (effectiveWaterRate === undefined || isNaN(effectiveWaterRate) || effectiveWaterRate <= 0) {
      return res.status(400).json({ message: 'A valid waterRate is required for WATER_ONLY billing.' });
    }
  }

  // Validate numeric fields
  if (unitCount !== undefined && (isNaN(unitCount) || unitCount < 0)) {
    return res.status(400).json({ message: 'unitCount must be a non-negative number' });
  }
  if (gasRate !== undefined && (isNaN(gasRate) || gasRate < 0)) {
    return res.status(400).json({ message: 'gasRate must be a non-negative number' });
  }
  if (waterRate !== undefined && (isNaN(waterRate) || waterRate < 0)) {
    return res.status(400).json({ message: 'waterRate must be a non-negative number' });
  }
  if (managementRate !== undefined && (isNaN(managementRate) || managementRate < 0)) {
    return res.status(400).json({ message: 'managementRate must be a non-negative number' });
  }

  // Validate boolean fields if provided
  if (billWater !== undefined && typeof billWater !== 'boolean') {
    return res.status(400).json({ message: 'billWater must be a boolean.' });
  }
  if (billGas !== undefined && typeof billGas !== 'boolean') {
    return res.status(400).json({ message: 'billGas must be a boolean.' });
  }
  if (billServiceCharge !== undefined && typeof billServiceCharge !== 'boolean') {
    return res.status(400).json({ message: 'billServiceCharge must be a boolean.' });
  }
  if (billGarbage !== undefined && typeof billGarbage !== 'boolean') {
    return res.status(400).json({ message: 'billGarbage must be a boolean.' });
  }
  if (billSecurity !== undefined && typeof billSecurity !== 'boolean') {
    return res.status(400).json({ message: 'billSecurity must be a boolean.' });
  }
  if (billAmenities !== undefined && typeof billAmenities !== 'boolean') {
    return res.status(400).json({ message: 'billAmenities must be a boolean.' });
  }
  if (billBackupGenerator !== undefined && typeof billBackupGenerator !== 'boolean') {
    return res.status(400).json({ message: 'billBackupGenerator must be a boolean.' });
  }
  if (allowWaterBillingWithAverages !== undefined && typeof allowWaterBillingWithAverages !== 'boolean') {
    return res.status(400).json({ message: 'allowWaterBillingWithAverages must be a boolean.' });
  }
  if (allowGasBillingWithAverages !== undefined && typeof allowGasBillingWithAverages !== 'boolean') {
    return res.status(400).json({ message: 'allowGasBillingWithAverages must be a boolean.' });
  }

  try {
    // Check if building exists and belongs to tenant
    const existingBuilding = await prisma.building.findUnique({
      where: { id },
      select: { id: true, tenantId: true, name: true },
    });

    if (!existingBuilding) {
      return res.status(404).json({ message: 'Building not found' });
    }

    if (existingBuilding.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Building does not belong to your tenant' });
    }

    // Prepare update data, only including fields that were provided
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (unitCount !== undefined) updateData.unitCount = unitCount ? parseInt(unitCount) : null;
    if (gasRate !== undefined) updateData.gasRate = gasRate ? parseFloat(gasRate) : null;
    if (waterRate !== undefined) updateData.waterRate = waterRate ? parseFloat(waterRate) : null;
    if (managementRate !== undefined) updateData.managementRate = managementRate ? parseFloat(managementRate) : null;
    if (billType !== undefined) updateData.billType = billType;
    if (billWater !== undefined) updateData.billWater = billWater;
    if (billGas !== undefined) updateData.billGas = billGas;
    if (billServiceCharge !== undefined) updateData.billServiceCharge = billServiceCharge;
    if (billGarbage !== undefined) updateData.billGarbage = billGarbage;
    if (billSecurity !== undefined) updateData.billSecurity = billSecurity;
    if (billAmenities !== undefined) updateData.billAmenities = billAmenities;
    if (billBackupGenerator !== undefined) updateData.billBackupGenerator = billBackupGenerator;
    if (allowWaterBillingWithAverages !== undefined) updateData.allowWaterBillingWithAverages = allowWaterBillingWithAverages;
    if (allowGasBillingWithAverages !== undefined) updateData.allowGasBillingWithAverages = allowGasBillingWithAverages;

    // Update the building
    const updatedBuilding = await prisma.building.update({
      where: { id },
      data: updateData,
    });

    // Log the action in UserActivity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `${user} UPDATED BUILDING ${updatedBuilding.name}`,
        details: {
          buildingId: updatedBuilding.id,
          updatedFields: Object.keys(updateData),
          billType: updateData.billType || existingBuilding.billType || 'FULL',
        },
        timestamp: new Date(),
      },
    });

    // Format response similar to getBuildingById
    const formattedBuilding = {
      ...updatedBuilding,
      buildingName: updatedBuilding.name,
    };

    res.status(200).json({ message: 'Building updated successfully', building: formattedBuilding });
  } catch (error) {
    console.error('Error updating building:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Building not found' });
    }
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};




const createBuilding = async (req, res) => {
  const { tenantId, user } = req.user; // Extract tenantId and user ID from authenticated user
  const {
    landlordId,
    name,
    address,
    unitCount,
    gasRate,
    waterRate,
    managementRate,
    billType = 'FULL', // Default to FULL
    billWater = false,
    billGas = false,
    billServiceCharge = false,
    billGarbage = false,
    billSecurity = false,
    billAmenities = false,
    billBackupGenerator = false,
    allowWaterBillingWithAverages = false,
    allowGasBillingWithAverages = false,
  } = req.body;

  // Validate required fields
  if (!tenantId || !landlordId || !name) {
    return res.status(400).json({ message: 'Required fields: tenantId, landlordId, name.' });
  }

  // Validate billType
  if (!['FULL', 'WATER_ONLY'].includes(billType)) {
    return res.status(400).json({ message: 'billType must be FULL or WATER_ONLY.' });
  }

  // Validate WATER_ONLY requirements
  if (billType === 'WATER_ONLY') {
    if (!billWater) {
      return res.status(400).json({ message: 'billWater must be true for WATER_ONLY billing.' });
    }
    if (waterRate === undefined || isNaN(waterRate) || waterRate <= 0) {
      return res.status(400).json({ message: 'A valid waterRate is required for WATER_ONLY billing.' });
    }
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
  if (managementRate !== undefined && (isNaN(managementRate) || managementRate < 0)) {
    return res.status(400).json({ message: 'managementRate must be a non-negative number.' });
  }

  // Validate boolean fields
  if (typeof billWater !== 'boolean') {
    return res.status(400).json({ message: 'billWater must be a boolean.' });
  }
  if (typeof billGas !== 'boolean') {
    return res.status(400).json({ message: 'billGas must be a boolean.' });
  }
  if (typeof billServiceCharge !== 'boolean') {
    return res.status(400).json({ message: 'billServiceCharge must be a boolean.' });
  }
  if (typeof billGarbage !== 'boolean') {
    return res.status(400).json({ message: 'billGarbage must be a boolean.' });
  }
  if (typeof billSecurity !== 'boolean') {
    return res.status(400).json({ message: 'billSecurity must be a boolean.' });
  }
  if (typeof billAmenities !== 'boolean') {
    return res.status(400).json({ message: 'billAmenities must be a boolean.' });
  }
  if (typeof billBackupGenerator !== 'boolean') {
    return res.status(400).json({ message: 'billBackupGenerator must be a boolean.' });
  }
  if (typeof allowWaterBillingWithAverages !== 'boolean') {
    return res.status(400).json({ message: 'allowWaterBillingWithAverages must be a boolean.' });
  }
  if (typeof allowGasBillingWithAverages !== 'boolean') {
    return res.status(400).json({ message: 'allowGasBillingWithAverages must be a boolean.' });
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
    const currentUser = await prisma.user.findUnique({
      where: { id: user },
      select: { firstName: true, lastName: true, tenantId: true, id: true },
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
        managementRate: managementRate ? parseFloat(managementRate) : null,
        unitCount: unitCount ? parseInt(unitCount) : null,
        gasRate: gasRate ? parseFloat(gasRate) : null,
        waterRate: waterRate ? parseFloat(waterRate) : null,
        billType,
        billWater,
        billGas,
        billServiceCharge,
        billGarbage,
        billSecurity,
        billAmenities,
        billBackupGenerator,
        allowWaterBillingWithAverages,
        allowGasBillingWithAverages,
      },
    });

    // Log the action in UserActivity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: currentUser.id } },
        tenant: { connect: { id: tenantId } },
        action: `${currentUser.firstName} CREATED BUILDING ${building.name}`,
        details: {
          buildingId: building.id,
          billType,
        },
        timestamp: new Date(),
      },
    });

    res.status(201).json({ message: 'Building created successfully', building });
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};



const getAllBuildings = async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { page = 1, limit = 10 } = req.query;

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  try {
    // Parse pagination params
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Fetch total count for pagination
    const totalBuildings = await prisma.building.count({
      where: { tenantId },
    });

    // Fetch buildings with related data
    const buildings = await prisma.building.findMany({
      where: { tenantId },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        landlordId: true,
        name: true,
        address: true,
        unitCount: true,
        gasRate: true,
        managementRate: true,
        waterRate: true,
        createdAt: true,
        updatedAt: true,
        landlord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        units: {
          select: {
            id: true,
            unitNumber: true,
            monthlyCharge: true,
            depositAmount: true,
            garbageCharge: true,
            serviceCharge: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            customers: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                secondaryPhoneNumber: true,
                nationalId: true,
                status: true,
                closingBalance: true,
                leaseFileUrl: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

 

    // Format response to include buildingName and landlord name
    const formattedBuildings = buildings.map((building) => ({
      ...building,
      buildingName: building.name,
      landlord: building.landlord
        ? {
            ...building.landlord,
            name: `${building.landlord.firstName} ${building.landlord.lastName}`.trim(),
          }
        : null,
      units: building.units.map((unit) => ({
        ...unit,
        customerCount: unit.customers.length,
      })),
    }));

    res.status(200).json({
      buildings: formattedBuildings,
      total: totalBuildings,
      currentPage: pageNum,
      totalPages: Math.ceil(totalBuildings / limitNum),
    });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};


const getAllBuildingsWithDetails = async (req, res) => {
  const { tenantId } = req.user;
  const { page = 1, limit = 20, includeUnits = false } = req.query;

  try {
    const buildings = await prisma.building.findMany({
      where: { tenantId },
      skip: (page - 1) * limit,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        landlord: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
        units: includeUnits === 'true' ? {
          select: { id: true, unitNumber: true, status: true }
        } : false
      }
    });

    const total = await prisma.building.count({ where: { tenantId } });

    res.json({
      data: buildings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("Error fetching buildings:", err);
    res.status(500).json({ message: "Failed to fetch buildings." });
  }
};








const createUnit = async (req, res) => {
  const { tenantId, user } = req.user; // Extract tenantId and user ID from authenticated user
  const {
    buildingId,
    unitNumber,
    monthlyCharge,
    depositAmount,
    garbageCharge,
    serviceCharge,
    securityCharge,
    amenitiesCharge,
    backupGeneratorCharge,
    status,
  } = req.body;

  // Validate required fields
  if (!tenantId || !buildingId || !unitNumber) {
    return res.status(400).json({
      success: false,
      message: 'Required fields: tenantId, buildingId, unitNumber.',
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
      select: { id: true, tenantId: true, name: true, billType: true },
    });
    if (!building || building.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Building not found or does not belong to the tenant.',
      });
    }

    // Validate charges based on building.billType
    if (building.billType === 'WATER_ONLY') {
      // Check that forbidden fields are not provided
      const forbiddenFields = [
        monthlyCharge !== undefined && 'monthlyCharge',
        depositAmount !== undefined && 'depositAmount',
        garbageCharge !== undefined && 'garbageCharge',
        serviceCharge !== undefined && 'serviceCharge',
        securityCharge !== undefined && 'securityCharge',
        amenitiesCharge !== undefined && 'amenitiesCharge',
        backupGeneratorCharge !== undefined && 'backupGeneratorCharge',
      ].filter(Boolean);

      if (forbiddenFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `The following fields must not be provided for WATER_ONLY buildings: ${forbiddenFields.join(', ')}.`,
        });
      }
    } else {
      // For FULL buildings, validate that monthlyCharge and depositAmount are provided and non-negative
      if (monthlyCharge == null || depositAmount == null) {
        return res.status(400).json({
          success: false,
          message: 'monthlyCharge and depositAmount are required for FULL buildings.',
        });
      }
      if (monthlyCharge < 0 || depositAmount < 0) {
        return res.status(400).json({
          success: false,
          message: 'monthlyCharge and depositAmount must be non-negative.',
        });
      }
      // Validate optional charges for FULL buildings
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
      if (securityCharge != null && securityCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'securityCharge must be non-negative.',
        });
      }
      if (amenitiesCharge != null && amenitiesCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'amenitiesCharge must be non-negative.',
        });
      }
      if (backupGeneratorCharge != null && backupGeneratorCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'backupGeneratorCharge must be non-negative.',
        });
      }
    }

    // Validate status
    const validStatuses = ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'OCCUPIED_PENDING_PAYMENT'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
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

    // Prepare unit data
    const unitData = {
      tenantId,
      buildingId,
      unitNumber,
      status: status || 'VACANT',
    };

    // Set charges based on billType
    if (building.billType === 'WATER_ONLY') {
      unitData.monthlyCharge = 0;
      unitData.depositAmount = 0;
      unitData.garbageCharge = null;
      unitData.serviceCharge = null;
      unitData.securityCharge = null;
      unitData.amenitiesCharge = null;
      unitData.backupGeneratorCharge = null;
    } else {
      unitData.monthlyCharge = parseFloat(monthlyCharge);
      unitData.depositAmount = parseFloat(depositAmount);
      unitData.garbageCharge = garbageCharge != null ? parseFloat(garbageCharge) : null;
      unitData.serviceCharge = serviceCharge != null ? parseFloat(serviceCharge) : null;
      unitData.securityCharge = securityCharge != null ? parseFloat(securityCharge) : null;
      unitData.amenitiesCharge = amenitiesCharge != null ? parseFloat(amenitiesCharge) : null;
      unitData.backupGeneratorCharge = backupGeneratorCharge != null ? parseFloat(backupGeneratorCharge) : null;
    }

    // Create unit
    const unit = await prisma.unit.create({
      data: unitData,
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
        action: `${currentUser.firstName} CREATED UNIT ${unitNumber} IN BUILDING ${building.name}`,
        details: {
          unitId: unit.id,
          buildingId,
          billType: building.billType,
        },
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

const editUnit = async (req, res) => {
  const { tenantId, user } = req.user; // Extract tenantId and user ID from authenticated user
  const { unitId } = req.params; // Extract unitId from URL parameters
  const {
    buildingId,
    unitNumber,
    monthlyCharge,
    depositAmount,
    garbageCharge,
    serviceCharge,
    securityCharge,
    amenitiesCharge,
    backupGeneratorCharge,
    status,
  } = req.body;

  // Validate required fields
  if (!tenantId || !unitId) {
    return res.status(400).json({
      success: false,
      message: 'Required fields: tenantId, unitId.',
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

    // Check if unit exists and belongs to the tenant
    const existingUnit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, tenantId: true, buildingId: true, unitNumber: true },
    });
    if (!existingUnit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found.',
      });
    }
    if (existingUnit.tenantId !== tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Unit does not belong to the specified tenant.',
      });
    }

    // Determine buildingId (from request body or existing unit)
    const effectiveBuildingId = buildingId || existingUnit.buildingId;

    // Check if building exists and belongs to the tenant
    const building = await prisma.building.findUnique({
      where: { id: effectiveBuildingId },
      select: { id: true, tenantId: true, name: true, billType: true },
    });
    if (!building || building.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Building not found or does not belong to the tenant.',
      });
    }

    // Validate charges based on building.billType
    if (building.billType === 'WATER_ONLY') {
      // Check that forbidden fields are not provided
      const forbiddenFields = [
        monthlyCharge !== undefined && 'monthlyCharge',
        depositAmount !== undefined && 'depositAmount',
        garbageCharge !== undefined && 'garbageCharge',
        serviceCharge !== undefined && 'serviceCharge',
        securityCharge !== undefined && 'securityCharge',
        amenitiesCharge !== undefined && 'amenitiesCharge',
        backupGeneratorCharge !== undefined && 'backupGeneratorCharge',
      ].filter(Boolean);

      if (forbiddenFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `The following fields must not be provided for WATER_ONLY buildings: ${forbiddenFields.join(', ')}.`,
        });
      }
    } else {
      // For FULL buildings, validate that monthlyCharge and depositAmount are non-negative if provided
      if (monthlyCharge !== undefined && monthlyCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'monthlyCharge must be non-negative.',
        });
      }
      if (depositAmount !== undefined && depositAmount < 0) {
        return res.status(400).json({
          success: false,
          message: 'depositAmount must be non-negative.',
        });
      }
      // Validate optional charges for FULL buildings
      if (garbageCharge !== undefined && garbageCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'garbageCharge must be non-negative.',
        });
      }
      if (serviceCharge !== undefined && serviceCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'serviceCharge must be non-negative.',
        });
      }
      if (securityCharge !== undefined && securityCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'securityCharge must be non-negative.',
        });
      }
      if (amenitiesCharge !== undefined && amenitiesCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'amenitiesCharge must be non-negative.',
        });
      }
      if (backupGeneratorCharge !== undefined && backupGeneratorCharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'backupGeneratorCharge must be non-negative.',
        });
      }
    }

    // Validate status if provided
    const validStatuses = ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'OCCUPIED_PENDING_PAYMENT'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
      });
    }

    // Check for duplicate unitNumber within the building if unitNumber is updated
    if (unitNumber && unitNumber !== existingUnit.unitNumber) {
      const duplicateUnit = await prisma.unit.findFirst({
        where: {
          buildingId: effectiveBuildingId,
          unitNumber,
        },
      });
      if (duplicateUnit) {
        return res.status(400).json({
          success: false,
          message: `Unit number ${unitNumber} already exists in this building.`,
        });
      }
    }

    // Prepare update data, only including provided fields
    const updateData = {};
    if (buildingId !== undefined) updateData.buildingId = buildingId;
    if (unitNumber !== undefined) updateData.unitNumber = unitNumber;
    if (status !== undefined) updateData.status = status;

    // Set charges based on billType
    if (building.billType === 'WATER_ONLY') {
      updateData.monthlyCharge = 0;
      updateData.depositAmount = 0;
      updateData.garbageCharge = null;
      updateData.serviceCharge = null;
      updateData.securityCharge = null;
      updateData.amenitiesCharge = null;
      updateData.backupGeneratorCharge = null;
    } else {
      if (monthlyCharge !== undefined) updateData.monthlyCharge = parseFloat(monthlyCharge);
      if (depositAmount !== undefined) updateData.depositAmount = parseFloat(depositAmount);
      if (garbageCharge !== undefined) updateData.garbageCharge = garbageCharge != null ? parseFloat(garbageCharge) : null;
      if (serviceCharge !== undefined) updateData.serviceCharge = serviceCharge != null ? parseFloat(serviceCharge) : null;
      if (securityCharge !== undefined) updateData.securityCharge = securityCharge != null ? parseFloat(securityCharge) : null;
      if (amenitiesCharge !== undefined) updateData.amenitiesCharge = amenitiesCharge != null ? parseFloat(amenitiesCharge) : null;
      if (backupGeneratorCharge !== undefined) updateData.backupGeneratorCharge = backupGeneratorCharge != null ? parseFloat(backupGeneratorCharge) : null;
    }

    // Update unit
    const updatedUnit = await prisma.unit.update({
      where: { id: unitId },
      data: updateData,
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `${currentUser.firstName} UPDATED UNIT ${updatedUnit.unitNumber} IN BUILDING ${building.name}`,
        details: {
          unitId: updatedUnit.id,
          buildingId: effectiveBuildingId,
          billType: building.billType,
          updatedFields: Object.keys(updateData),
        },
        timestamp: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Unit updated successfully',
      data: updatedUnit,
    });
  } catch (error) {
    console.error('Error updating unit:', error);

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
        message: 'Invalid data provided for unit update.',
      });
    }

    // Handle relation errors
    if (error.code === 'P2025') {
      return res.status(400).json({
        success: false,
        message: 'Invalid unit, tenant, or building reference.',
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




const getUnitsByBuilding = async (req, res) => {
  const { tenantId } = req.user;
  const { buildingId } = req.query;

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required.' });
  }

  if (!buildingId) {
    return res.status(400).json({ message: 'Building ID is required.' });
  }

  try {
    // Verify building exists and belongs to tenant
    const building = await prisma.building.findUnique({
      where: { id: buildingId },
    });
    if (!building || building.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Building not found or does not belong to tenant.' });
    }

    const units = await prisma.unit.findMany({
      where: {
        buildingId,
        tenantId,
      },
      select: {
        id: true,
        unitNumber: true,
      },
      orderBy: { unitNumber: 'asc' },
    });

    res.status(200).json({ units });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};

const getUnitDetailsById = async(req, res) =>{
  const { unitId } = req.params;
  const tenantId = req.user?.tenantId;  // Assuming multi-tenant system

  if (!tenantId) {
    return res.status(401).json({ success: false, message: 'Unauthorized: tenant not identified.' });
  }

  try {
    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        tenantId: tenantId
      },
      include: {
        building: true,
        tenant: true,
        customers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            secondaryPhoneNumber: true,
            nationalId: true,
            status: true,
            closingBalance: true,
            leaseFileUrl: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found.' });
    }

    return res.json({ success: true, data: unit });
  } catch (error) {
    console.error('Error fetching unit details:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}






module.exports = { createBuilding, searchBuildings ,createUnit, getAllBuildings, getBuildingById, getUnitsByBuilding ,editBuilding,editUnit,getUnitDetailsById};
