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
  const tenantId = req.user?.tenantId;

  const { user } = req.user;
  
  console.log(`user ${user}`);// Extract user ID from authenticated user
  const { buildingId: id } = req.params;
  const {
    name,
    address,
    unitCount,
    gasRate,
    waterRate,
    allowWaterBillingWithAverages,
    allowGasBillingWithAverages,
    billWater,
    billGas,
    billServiceCharge,
    billGarbage,
    billSecurity,
    billAmenities,
    billBackupGenerator,
  } = req.body;

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
    if (name) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (unitCount !== undefined) updateData.unitCount = unitCount ? parseInt(unitCount) : null;
    if (gasRate !== undefined) updateData.gasRate = gasRate ? parseFloat(gasRate) : null;
    if (waterRate !== undefined) updateData.waterRate = waterRate ? parseFloat(waterRate) : null;
    if (allowWaterBillingWithAverages !== undefined)
      updateData.allowWaterBillingWithAverages = allowWaterBillingWithAverages;
    if (allowGasBillingWithAverages !== undefined)
      updateData.allowGasBillingWithAverages = allowGasBillingWithAverages;
    if (billWater !== undefined) updateData.billWater = billWater;
    if (billGas !== undefined) updateData.billGas = billGas;
    if (billServiceCharge !== undefined) updateData.billServiceCharge = billServiceCharge;
    if (billGarbage !== undefined) updateData.billGarbage = billGarbage;
    if (billSecurity !== undefined) updateData.billSecurity = billSecurity;
    if (billAmenities !== undefined) updateData.billAmenities = billAmenities;
    if (billBackupGenerator !== undefined) updateData.billBackupGenerator = billBackupGenerator;

    // Update the building
    const updatedBuilding = await prisma.building.update({
      where: { id },
      data: updateData,
    });

    // Log the action in UserActivity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        //tenantId,
        action: `${user} UPDATED BUILDING ${updatedBuilding.name}`,
        timestamp: new Date(),
        tenant: { connect: { id: tenantId } },
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

  const currentUser = await prisma.user.findUnique({
    where: { id: user },
    select: { firstName: true, lastName: true, tenantId: true ,id:true},
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
        managementRate: managementRate ? parseFloat(managementRate) : null,
        unitCount: unitCount ? parseInt(unitCount) : null,
        gasRate: gasRate ? parseFloat(gasRate) : null,
        waterRate: waterRate ? parseFloat(waterRate) : null,
      },
    });

    await prisma.userActivity.create({
      data: {
        user: { connect: { id: currentUser.id } },
        tenant: { connect: { id: tenantId } },
        
        action: `${currentUser.firstName} CREATED BUILDING ${building.name}`,
        timestamp: new Date(),
      },
    });

    res.status(201).json({ message: 'Building created successfully', building });
  } catch (error) {
    console.error('Error creating building:', error);
    res.status(500).json({ message: 'Internal server error' });
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



module.exports = { createBuilding, searchBuildings };
