const { PrismaClient, LandlordStatus } = require('@prisma/client');
const prisma = new PrismaClient();

const createLandlord = async (req, res) => {
  const { tenantId, id: userId } = req.user; // Extract tenantId and userId
  const { firstName, lastName, email, phoneNumber, status } = req.body;

  // Validate required fields
  if (!tenantId || !firstName || !lastName || !phoneNumber) {
    return res.status(400).json({
      message: 'Required fields: tenantId, firstName, lastName, phoneNumber.',
    });
  }

  // Validate status
  const validStatuses = Object.values(LandlordStatus);
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
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

   

    // Check if landlord with phone/email already exists for the tenant
    const existingLandlord = await prisma.landlord.findFirst({
      where: {
        tenantId,
        OR: [
          { phoneNumber },
          ...(email ? [{ email }] : []), // only check email if provided
        ],
      },
    });

    if (existingLandlord) {
      return res
        .status(400)
        .json({ message: 'Phone number or email already exists for this tenant.' });
    }

    // Create landlord
    const landlord = await prisma.landlord.create({
      data: {
        tenantId,
        firstName,
        lastName,
        email,
        phoneNumber,
        status: status ?? 'ACTIVE',
      },
    });

    // Log user activity
    // await prisma.userActivity.create({
    //   data: {
    //     user: { connect: { id: userId } },
    //     tenant: { connect: { id: tenantId } },
    //     action: `added landlord by ${req.user.firstName} ${req.user.lastName}`,
    //     timestamp: new Date(),
    //   },
    // });

    return res.status(201).json({
      success: true,
      message: 'Landlord created successfully',
      data: landlord,
    });
  } catch (error) {
    console.error('Error creating landlord:', error);

    if (error.code === 'P2002') {
      return res
        .status(400)
        .json({ message: 'Phone number or email must be unique.' });
    }

    return res.status(500).json({ message: 'Internal server error' });
  }
};


const editLandlord = async (req, res) => {
  const { tenantId, userId } = req.user;
  const { id:landlordId } = req.params;
  const { firstName, lastName, email, phoneNumber, status } = req.body;

  if (!landlordId) {
    return res.status(400).json({ message: 'Landlord ID is required.' });
  }

  try {
    const landlord = await prisma.landlord.findFirst({
      where: {
        id: landlordId,
        tenantId,
      },
    });

    if (!landlord) {
      return res.status(404).json({ message: 'Landlord not found for this tenant.' });
    }

    // Validate status if provided
    const validStatuses = Object.values(LandlordStatus);
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
      });
    }

    // Check for uniqueness (excluding current landlord)
    const duplicate = await prisma.landlord.findFirst({
      where: {
        tenantId,
        id: { not: landlordId },
        OR: [
          { phoneNumber },
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (duplicate) {
      return res.status(400).json({
        message: 'Phone number or email already exists for another landlord.',
      });
    }

    const updatedLandlord = await prisma.landlord.update({
      where: { id: landlordId },
      data: {
        firstName,
        lastName,
        email,
        phoneNumber,
        status,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Landlord updated successfully',
      data: updatedLandlord,
    });
  } catch (error) {
    console.error('Error updating landlord:', error);

    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Phone number or email must be unique.' });
    }

    return res.status(500).json({ message: 'Internal server error' });
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





const getLandlordDetails = async (req, res) => {
  const { id: landlordId } = req.params;
  const { tenantId } = req.user;

  if (!landlordId) {
    return res.status(400).json({ message: 'Landlord ID is required' });
  }

  try {
    const landlord = await prisma.landlord.findUnique({
      where: { id: landlordId },
      include: {
        buildings: {
          where: { tenantId },
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!landlord || landlord.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Landlord not found or does not belong to tenant.' });
    }

    res.status(200).json({ landlord });
  } catch (error) {
    console.error('Error fetching landlord details:', error);
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





module.exports = { createLandlord , searchLandlords ,getAllLandlords, getLandlordById, getLandlordDetails,editLandlord};
