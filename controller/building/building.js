const { PrismaClient, UnitStatus } = require('@prisma/client');
const prisma = new PrismaClient();




// controller/buildingController.js



// const getBuildingById = async (req, res) => {
//   const { id } = req.params;

//   try {
//     const building = await prisma.building.findUnique({
//       where: { id: Number(id) },
//       include: {
//         landlord: true,
//         units: {
//           include: {
//             customerUnits: {
//               where: { status: 'ACTIVE' },
//               include: { customer: true },
//             },
//           },
//         },
//       },
//     });

//     if (!building) {
//       return res.status(404).json({ message: 'Building not found' });
//     }

//     // Optional: Sanitize/transform for frontend if needed
//     res.json(building);
//   } catch (error) {
//     console.error('Error fetching building:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// };



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




// const editBuilding = async (req, res) => {
//   const tenantId = req.user?.tenantId;

//   const { user } = req.user;
  
//   console.log(`user ${user}`);// Extract user ID from authenticated user
//   const { buildingId: id } = req.params;
//   const {
//     name,
//     address,
//     unitCount,
//     gasRate,
//     waterRate,
//     allowWaterBillingWithAverages,
//     allowGasBillingWithAverages,
//     billWater,
//     billGas,
//     billServiceCharge,
//     billGarbage,
//     billSecurity,
//     billAmenities,
//     billBackupGenerator,
//   } = req.body;

//   // Validate tenantId and buildingId
//   if (!tenantId) {
//     return res.status(400).json({ message: 'Tenant ID is required' });
//   }

//   if (!id) {
//     return res.status(400).json({ message: 'Building ID is required' });
//   }

//   // Validate required fields
//   if (name !== undefined && !name) {
//     return res.status(400).json({ message: 'Name is required if provided' });
//   }

//   // Validate numeric fields
//   if (unitCount !== undefined && (isNaN(unitCount) || unitCount < 0)) {
//     return res.status(400).json({ message: 'unitCount must be a non-negative number' });
//   }
//   if (gasRate !== undefined && (isNaN(gasRate) || gasRate < 0)) {
//     return res.status(400).json({ message: 'gasRate must be a non-negative number' });
//   }
//   if (waterRate !== undefined && (isNaN(waterRate) || waterRate < 0)) {
//     return res.status(400).json({ message: 'waterRate must be a non-negative number' });
//   }

//   try {
//     // Check if building exists and belongs to tenant
//     const existingBuilding = await prisma.building.findUnique({
//       where: { id },
//       select: { id: true, tenantId: true, name: true },
//     });

//     if (!existingBuilding) {
//       return res.status(404).json({ message: 'Building not found' });
//     }

//     if (existingBuilding.tenantId !== tenantId) {
//       return res.status(403).json({ message: 'Building does not belong to your tenant' });
//     }

//     // Prepare update data, only including fields that were provided
//     const updateData = {};
//     if (name) updateData.name = name;
//     if (address !== undefined) updateData.address = address;
//     if (unitCount !== undefined) updateData.unitCount = unitCount ? parseInt(unitCount) : null;
//     if (gasRate !== undefined) updateData.gasRate = gasRate ? parseFloat(gasRate) : null;
//     if (waterRate !== undefined) updateData.waterRate = waterRate ? parseFloat(waterRate) : null;
//     if (allowWaterBillingWithAverages !== undefined)
//       updateData.allowWaterBillingWithAverages = allowWaterBillingWithAverages;
//     if (allowGasBillingWithAverages !== undefined)
//       updateData.allowGasBillingWithAverages = allowGasBillingWithAverages;
//     if (billWater !== undefined) updateData.billWater = billWater;
//     if (billGas !== undefined) updateData.billGas = billGas;
//     if (billServiceCharge !== undefined) updateData.billServiceCharge = billServiceCharge;
//     if (billGarbage !== undefined) updateData.billGarbage = billGarbage;
//     if (billSecurity !== undefined) updateData.billSecurity = billSecurity;
//     if (billAmenities !== undefined) updateData.billAmenities = billAmenities;
//     if (billBackupGenerator !== undefined) updateData.billBackupGenerator = billBackupGenerator;

//     // Update the building
//     const updatedBuilding = await prisma.building.update({
//       where: { id },
//       data: updateData,
//     });

//     // Log the action in UserActivity
//     await prisma.userActivity.create({
//       data: {
//         user: { connect: { id: user } },
//         //tenantId,
//         action: `${user} UPDATED BUILDING ${updatedBuilding.name}`,
//         timestamp: new Date(),
//         tenant: { connect: { id: tenantId } },
//       },
//     });

//     // Format response similar to getBuildingById
//     const formattedBuilding = {
//       ...updatedBuilding,
//       buildingName: updatedBuilding.name,
//     };

//     res.status(200).json({ message: 'Building updated successfully', building: formattedBuilding });
//   } catch (error) {
//     console.error('Error updating building:', error);
//     if (error.code === 'P2025') {
//       return res.status(404).json({ message: 'Building not found' });
//     }
//     res.status(500).json({ message: 'Internal server error' });
//   } finally {
//     await prisma.$disconnect();
//   }
// };









const createBuilding = async (req, res) => {
  const { landlordId, name, address, unitCount, gasRate, waterRate, allowWaterBillingWithAverages, allowGasBillingWithAverages, billWater, billGas, billServiceCharge, billGarbage, billSecurity, billAmenities, billBackupGenerator, billPower, managementRate, billType, caretakerId } = req.body;
  const { tenantId, userId} = req.user; // Extract tenantId and userId from authenticated user
   
  console.log(`this is the user ${JSON.stringify(req.user)}`);
  // Validate req.user
  if (!userId || !tenantId) {
    return res.status(401).json({ success: false, message: 'Authenticated user ID or tenant ID is missing' });
  }

  // Validate required fields
  if (!landlordId || !name) {
    return res.status(400).json({ success: false, message: 'Required fields: landlordId, name' });
  }

  // Validate numeric fields
  if (unitCount !== undefined && (isNaN(unitCount) || unitCount < 0)) {
    return res.status(400).json({ success: false, message: 'unitCount must be a non-negative number' });
  }
  if (gasRate !== undefined && (isNaN(gasRate) || gasRate < 0)) {
    return res.status(400).json({ success: false, message: 'gasRate must be a non-negative number' });
  }
  if (waterRate !== undefined && (isNaN(waterRate) || waterRate < 0)) {
    return res.status(400).json({ success: false, message: 'waterRate must be a non-negative number' });
  }
  if (managementRate !== undefined && (isNaN(managementRate) || managementRate < 0)) {
    return res.status(400).json({ success: false, message: 'managementRate must be a non-negative number' });
  }

  try {
    // Verify authenticated user
   
    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    // Verify landlord exists and belongs to the tenant
    const landlord = await prisma.landlord.findUnique({
      where: { id: landlordId },
      select: { id: true, tenantId: true },
    });
    if (!landlord || landlord.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Landlord not found or does not belong to tenant' });
    }

    // Verify caretaker (if provided)
    if (caretakerId) {
      const caretaker = await prisma.user.findUnique({
        where: { id: caretakerId },
        select: { id: true, tenantId: true },
      });
      if (!caretaker || caretaker.tenantId !== tenantId) {
        return res.status(404).json({ success: false, message: 'Caretaker not found or does not belong to tenant' });
      }
    }

    // Create building
    const building = await prisma.building.create({
      data: {
        tenantId,
        landlordId,
        name,
        address: address || null,
        unitCount: unitCount ? parseInt(unitCount) : null,
        gasRate: gasRate ? parseFloat(gasRate) : null,
        waterRate: waterRate ? parseFloat(waterRate) : null,
        allowWaterBillingWithAverages: allowWaterBillingWithAverages || false,
        allowGasBillingWithAverages: allowGasBillingWithAverages || false,
        billWater: billWater || false,
        billGas: billGas || false,
        billServiceCharge: billServiceCharge || false,
        billGarbage: billGarbage || false,
        billSecurity: billSecurity || false,
        billAmenities: billAmenities || false,
        billBackupGenerator: billBackupGenerator || false,
        billPower: billPower || false,
        managementRate: managementRate ? parseFloat(managementRate) : null,
        billType: billType || 'FULL',
        caretakerId: caretakerId ? parseInt(caretakerId) : null,
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
        billPower: true,
        managementRate: true,
        billType: true,
        caretakerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        userId: userId,
        tenantId,
        action: `CREATED BUILDING ${building.name}`,
        timestamp: new Date(),
        details: { buildingId: building.id },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Building created successfully',
      data: building,
    });
  } catch (error) {
    console.error('Error creating building:', {
      error: error.message,
      stack: error.stack,
      tenantId,
      landlordId,
      userId,
    });

    if (error.name === 'PrismaClientKnownRequestError') {
      if (error.code === 'P2002') {
        return res.status(400).json({
          success: false,
          message: 'A building with this name may already exist for the tenant',
        });
      }
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'Referenced resource (e.g., landlord or caretaker) not found',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid database request',
        error: error.message,
      });
    }

    res.status(500).json({ success: false, message: 'Internal server error' });
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
        monthlyCharge:(parseFloat(monthlyCharge)),
        depositAmount: parseFloat(depositAmount),
       
        garbageCharge: parseFloat(garbageCharge) || null,
        serviceCharge: parseFloat(serviceCharge) || null,
        status: status || 'VACANT',
      },
    });

    // Update building unitCount
    await prisma.building.update({
      where: { id: buildingId },
      data: { unitCount: { increment: 1 } },
    });

    // // Log user activity
    // await prisma.userActivity.create({
    //   data: {
    //     user: { connect: { id: req.user.user } },
    //     tenant: { connect: { id: tenantId } },

    //     action: `CREATED UNIT ${unitNumber} IN BUILDING ${building.name}`,
    //     timestamp: new Date(),
    //   },
    // });

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
  } 
};




const  assignUnitToCustomer = async (req, res) => {
  const { customerId, unitId } = req.body;
  try {
    // Fetch the unit with its current status
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit) {
      throw new Error('Unit not found');
    }

    if (unit.status !== UnitStatus.VACANT) {
      throw new Error(`Unit is not vacant (current status: ${unit.status})`);
    }

    // Create the customer-unit relationship
    const assignment = await prisma.customerUnit.create({
      data: {
        customerId,
        unitId,
        isActive: true,
        startDate: new Date(),
      },
    });

    // Update the unit's status to OCCUPIED
    await prisma.unit.update({
      where: { id: unitId },
      data: {
        status: UnitStatus.OCCUPIED,
      },
    });

    return assignment;
  } catch (err) {
    throw new Error(`Failed to assign unit: ${err.message}`);
  }
}




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




const getUnitDetails = async (req, res) => {
  const { unitId:id } = req.params;
  const { tenantId } = req.user; // Assuming tenantId is available from authentication middleware

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Valid Unit ID is required' });
  }

  try {
    const unit = await prisma.unit.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
        unitNumber: true,
        monthlyCharge: true,
        depositAmount: true,
        garbageCharge: true,
        serviceCharge: true,
        securityCharge: true,
        amenitiesCharge: true,
        backupGeneratorCharge: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        building: {
          select: {
            id: true,
            name: true,
            address: true,
            landlordId: true,
          },
        },
        CustomerUnit: {
          where: { isActive: true },
          select: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                email: true,
              },
            },
            startDate: true,
            endDate: true,
            isActive: true,
          },
        },
      },
    });

    if (!unit) {
      return res.status(404).json({ message: 'Unit not found or does not belong to this tenant' });
    }

    // Format the response to match the frontend's expectations
    const formattedUnit = {
      id: unit.id,
      unitNumber: unit.unitNumber,
      monthlyCharge: unit.monthlyCharge || 0,
      depositAmount: unit.depositAmount || 0,
      garbageCharge: unit.garbageCharge || 0,
      serviceCharge: unit.serviceCharge || 0,
      securityCharge: unit.securityCharge || 0,
      amenitiesCharge: unit.amenitiesCharge || 0,
      backupGeneratorCharge: unit.backupGeneratorCharge || 0,
      status: unit.status,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
      building: unit.building
        ? {
            id: unit.building.id,
            name: unit.building.name,
            address: unit.building.address || null,
            landlordId: unit.building.landlordId,
          }
        : null,
      customers: unit.CustomerUnit.map((cu) => ({
        id: cu.customer.id,
        fullName: `${cu.customer.firstName} ${cu.customer.lastName}`.trim(),
        phoneNumber: cu.customer.phoneNumber,
        email: cu.customer.email || null,
        startDate: cu.startDate.toISOString(),
        endDate: cu.endDate?.toISOString() || null,
        isActive: cu.isActive,
      })),
    };

    res.status(200).json({ data: formattedUnit });
  } catch (error) {
    console.error('Error retrieving unit details:', {
      error: error.message,
      stack: error.stack,
      unitId: id,
      tenantId,
    });

    if (error.name === 'PrismaClientKnownRequestError') {
      if (error.code === 'P2025') {
        return res.status(404).json({ message: 'Unit not found' });
      }
      return res.status(400).json({ message: 'Invalid database request', error: error.message });
    }

    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};




const editBuilding = async (req, res) => {
  const { buildingId } = req.params;
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
  const { tenantId, userId, role, firstName, lastName } = req.user;

  console.log('req.user:', JSON.stringify(req.user)); // Debug log

  // Validate req.user
  if (!userId || !tenantId) {
    return res.status(401).json({ success: false, message: 'Authenticated user ID or tenant ID is missing' });
  }

  // Validate required fields
  if (!name) {
    return res.status(400).json({ success: false, message: 'Building name is required' });
  }

  // Validate numeric fields
  if (unitCount !== undefined && (isNaN(unitCount) || parseInt(unitCount) < 0)) {
    return res.status(400).json({ success: false, message: 'unitCount must be a non-negative number' });
  }
  if (gasRate !== undefined && (isNaN(gasRate) || parseFloat(gasRate) < 0)) {
    return res.status(400).json({ success: false, message: 'gasRate must be a non-negative number' });
  }
  if (waterRate !== undefined && (isNaN(waterRate) || parseFloat(waterRate) < 0)) {
    return res.status(400).json({ success: false, message: 'waterRate must be a non-negative number' });
  }
  if (managementRate !== undefined && (isNaN(managementRate) || parseFloat(managementRate) < 0)) {
    return res.status(400).json({ success: false, message: 'managementRate must be a non-negative number' });
  }
  if (billType === 'WATER_ONLY' && !billWater) {
    return res.status(400).json({ success: false, message: 'billWater must be enabled for WATER_ONLY billing' });
  }
  if (billType === 'WATER_ONLY' && (!waterRate || parseFloat(waterRate) <= 0)) {
    return res.status(400).json({ success: false, message: 'A valid water rate is required for WATER_ONLY billing' });
  }

  try {
    // Verify authenticated user
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'Authenticated user not found' });
    }
    if (currentUser.tenantId !== tenantId) {
      return res.status(403).json({ success: false, message: 'User does not belong to the specified tenant' });
    }
    if (!role.includes('ADMIN')) {
      return res.status(403).json({ success: false, message: 'Only admins can update buildings' });
    }

    // Verify building exists and belongs to the tenant
    const building = await prisma.building.findUnique({
      where: { id: buildingId },
      select: { id: true, tenantId: true, landlordId: true },
    });
    if (!building) {
      return res.status(404).json({ success: false, message: 'Building not found' });
    }
    if (building.tenantId !== tenantId) {
      return res.status(403).json({ success: false, message: 'Building does not belong to the authenticated tenant' });
    }

    // Update building
    const updatedBuilding = await prisma.building.update({
      where: { id: buildingId },
      data: {
        name,
        address: address || null,
        unitCount: unitCount ? parseInt(unitCount) : null,
        gasRate: gasRate ? parseFloat(gasRate) : null,
        waterRate: waterRate ? parseFloat(waterRate) : null,
        managementRate: managementRate ? parseFloat(managementRate) : null,
        billType: billType || 'FULL',
        billWater: billWater || false,
        billGas: billGas || false,
        billServiceCharge: billServiceCharge || false,
        billGarbage: billGarbage || false,
        billSecurity: billSecurity || false,
        billAmenities: billAmenities || false,
        billBackupGenerator: billBackupGenerator || false,
        allowWaterBillingWithAverages: allowWaterBillingWithAverages || false,
        allowGasBillingWithAverages: allowGasBillingWithAverages || false,
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
        managementRate: true,
        billType: true,
        billWater: true,
        billGas: true,
        billServiceCharge: true,
        billGarbage: true,
        billSecurity: true,
        billAmenities: true,
        billBackupGenerator: true,
        allowWaterBillingWithAverages: true,
        allowGasBillingWithAverages: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        userId,
        tenantId,
        action: `UPDATED BUILDING ${updatedBuilding.name} by ${firstName} ${lastName}`,
        timestamp: new Date(),
        details: { buildingId: updatedBuilding.id },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Building updated successfully',
      building: updatedBuilding,
    });
  } catch (error) {
    console.error('Error updating building:', {
      error: error.message,
      stack: error.stack,
      tenantId,
      buildingId,
      userId,
    });

    if (error.name === 'PrismaClientKnownRequestError') {
      if (error.code === 'P2002') {
        return res.status(400).json({
          success: false,
          message: 'A building with this name may already exist for the tenant',
        });
      }
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'Building not found',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid database request',
        error: error.message,
      });
    }

    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};


// Adjust path to your prisma instance

// const createUnit = async (req, res) => {
//   try {
//     const {
//       buildingId,
//       unitNumber,
//       monthlyCharge,
//       depositAmount,
//       garbageCharge = 0,
//       serviceCharge = 0,
//     } = req.body;

//     // Basic validation
//     if (!buildingId || !unitNumber || !monthlyCharge || !depositAmount) {
//       return res.status(400).json({ message: 'Missing required fields' });
//     }

//     const newUnit = await prisma.unit.create({
//       data: {
//         building: { connect: { id: buildingId } },
//         unitNumber,
//         monthlyCharge: parseFloat(monthlyCharge),
//         depositAmount: parseFloat(depositAmount),
//         garbageCharge: parseFloat(garbageCharge),
//         serviceCharge: parseFloat(serviceCharge),
//       },
//     });

//     res.status(201).json(newUnit);
//   } catch (error) {
//     console.error('Error creating unit:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// };




const editUnit = async (req, res) => {
  const { tenantId } = req.user;
  const { unitId:id } = req.params; // unit ID from URL
  const {
    buildingId,
    unitNumber,
    monthlyCharge,
    depositAmount,
    garbageCharge,
    serviceCharge,
    status,
  } = req.body;

  // Validate required fields
  if (!tenantId || !buildingId || !unitNumber || monthlyCharge == null || depositAmount == null) {
    return res.status(400).json({
      success: false,
      message: 'Required fields: tenantId, buildingId, unitNumber, monthlyCharge, depositAmount.',
    });
  }

  // Validate charges
  if (monthlyCharge < 0 || depositAmount < 0) {
    return res.status(400).json({ success: false, message: 'monthlyCharge and depositAmount must be non-negative.' });
  }
  if (garbageCharge != null && garbageCharge < 0) {
    return res.status(400).json({ success: false, message: 'garbageCharge must be non-negative.' });
  }
  if (serviceCharge != null && serviceCharge < 0) {
    return res.status(400).json({ success: false, message: 'serviceCharge must be non-negative.' });
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
    // Fetch unit to ensure it exists and belongs to the tenant
    const existingUnit = await prisma.unit.findUnique({
      where: { id },
      include: { building: true },
    });

    if (!existingUnit || existingUnit.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Unit not found or access denied.' });
    }

    // Check for duplicate unitNumber in the same building
    const duplicateUnit = await prisma.unit.findFirst({
      where: {
        id: { not: id },
        buildingId,
        unitNumber,
      },
    });

    if (duplicateUnit) {
      return res.status(400).json({
        success: false,
        message: `Unit number ${unitNumber} already exists in this building.`,
      });
    }

    // Update the unit
    const updatedUnit = await prisma.unit.update({
      where: { id },
      data: {
        unitNumber,
        buildingId,
        monthlyCharge: parseFloat(monthlyCharge),
        depositAmount: parseFloat(depositAmount),
        garbageCharge: parseFloat(garbageCharge) || 0,
        serviceCharge: parseFloat(serviceCharge) || 0,
        status: status || 'VACANT',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Unit updated successfully',
      data: updatedUnit,
    });
  } catch (error) {
    console.error('Error editing unit:', error);

    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: `Unit number ${unitNumber} already exists in this building.`,
      });
    }

    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};





const getUnitsByBuilding = async (req, res) => {
  const { buildingId } = req.params;
  const tenantId = req.user?.tenantId;

  if (!buildingId) {
    return res.status(400).json({ message: 'Building ID is required' });
  }

  try {
    const units = await prisma.unit.findMany({
      where: {
        buildingId,
        tenantId,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.status(200).json({ data: units });
  } catch (error) {
    console.error('Error fetching units by building:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};




module.exports = { createBuilding, searchBuildings,assignUnitToCustomer, createUnit, getAllBuildings, getBuildingById, editBuilding ,getUnitDetails,editUnit,getUnitsByBuilding};
