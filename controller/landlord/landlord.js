
const { PrismaClient, LandlordStatus } = require('@prisma/client');
const prisma = new PrismaClient();






const createLandlord = async (req, res) => {
  const { tenantId, user } = req.user; // Extract from authenticated user
  const { firstName, lastName, email, phoneNumber, status } = req.body;

  // Validate required fields
  if (!tenantId || !firstName || !lastName || !phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Required fields: tenantId, firstName, lastName, phoneNumber.',
    });
  }

  // Validate status
  const validStatuses = Object.values(LandlordStatus);
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

    // Check for duplicate phone number or email
    const existingLandlord = await prisma.landlord.findFirst({
      where: {
        tenantId,
        OR: [
          { phoneNumber },
          email ? { email } : {},
        ],
      },
    });
    if (existingLandlord) {
      const conflictField = existingLandlord.phoneNumber === phoneNumber ? 'phone number' : 'email';
      return res.status(400).json({
        success: false,
        message: `A landlord with this ${conflictField} already exists for this tenant.`,
      });
    }

    // Create landlord
    const landlord = await prisma.landlord.create({
      data: {
        tenantId,
        firstName,
        lastName,
        email: email || null,
        phoneNumber,
        status: status || 'ACTIVE',
      },
    });


    await prisma.userActivity.create({
      data: {
        user: { connect: { id: currentUser.id } },
        tenant: { connect: { id: tenantId } },
        //customer: { connect: { id: customerId } }, // Link to the customer
        action: `${currentUser.firstName} Added  landlord ${firstName} ${lastName}`,
        timestamp: new Date(),
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Landlord created successfully',
      data: landlord,
    });
  } catch (error) {
    console.error('Error creating landlord:', error);

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      const field = target?.includes('phoneNumber') ? 'phone number' : 'email';
      return res.status(400).json({
        success: false,
        message: `The ${field} must be unique.`,
      });
    }

    // Handle Prisma validation error
    if (error.name === 'PrismaClientValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided for user activity creation.',
      });
    }

    // Handle other Prisma errors (e.g., relation violations)
    if (error.code === 'P2025') {
      return res.status(400).json({
        success: false,
        message: 'Invalid tenant or user reference in user activity.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  } finally {
    await prisma.$disconnect(); // Ensure Prisma client disconnects
  }
};



const searchLandlords = async (req, res) => {
  const { query } = req.query; // e.g., "John"
  const { tenantId } = req.user;

  if (!query) {
    return res.status(400).json({ message: 'Query parameter is required.' });
  }

  try {
    const landlords = await prisma.landlord.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
      },
      orderBy: { firstName: 'asc' },
      take: 10, // Limit results for performance
    });

    res.status(200).json({ message: 'Landlords retrieved successfully', landlords });
  } catch (error) {
    console.error('Error searching landlords:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};




const getBuildingsByLandlord = async (req, res) => {
  const { landlordId } = req.params;
  const { tenantId } = req.user;

  try {
    // Check if landlord exists
    const landlord = await prisma.landlord.findUnique({
      where: { id: landlordId },
    });

    if (!landlord || landlord.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Landlord not found or does not belong to tenant.' });
    }

    // Fetch buildings
    const buildings = await prisma.building.findMany({
      where: {
        landlordId,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        address: true,
        unitCount: true,
        customers: {
          select: {
            id: true,
            houseNumber: true,
            status: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ message: 'Buildings retrieved successfully', buildings });
  } catch (error) {
    console.error('Error fetching buildings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};



const getAllLandlords = async (req, res) => {
  const { tenantId } = req.user;
  const { name } = req.query;

  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }

  try {
    const where = { tenantId };
    if (name) {
      where.OR = [
        { firstName: { contains: name, mode: 'insensitive' } },
        { lastName: { contains: name, mode: 'insensitive' } },
      ];
    }

    const landlords = await prisma.landlord.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { firstName: 'asc' },
    });

    // Format response with full name
    const formattedLandlords = landlords.map((landlord) => ({
      ...landlord,
      name: `${landlord.firstName} ${landlord.lastName}`.trim(),
    }));

    res.status(200).json({ landlords: formattedLandlords });
  } catch (error) {
    console.error('Error fetching landlords:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$disconnect();
  }
};




const getLandlordById = async (req, res) => {
  try {
    const { id } = req.params; // Get landlord ID from URL params
    const currentUser = req.user; // Assuming auth middleware sets req.user with currentUser (including tenantId)

    if (!currentUser || !currentUser.tenantId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant ID missing.' });
    }

    // Fetch the landlord by ID, ensuring it belongs to the user's tenant
    const landlord = await prisma.landlord.findFirst({
      where: {
        id: id,
        tenantId: currentUser.tenantId, // Ensure landlord belongs to the user's tenant
      },
      include: {
       
        buildings: true, // Include related buildings
      },
    });

    // Check if landlord exists
    if (!landlord) {
      return res.status(404).json({ message: 'Landlord not found or you do not have access.' });
    }

    // Return the landlord details
    return res.status(200).json({ landlord });
  } catch (error) {
    console.error('Error fetching landlord:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};





module.exports = { getBuildingsByLandlord , createLandlord , searchLandlords ,getAllLandlords, getLandlordById };



