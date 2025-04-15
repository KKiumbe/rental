const { PrismaClient, LandlordStatus } = require('@prisma/client');
const prisma = new PrismaClient();

const createLandlord = async (req, res) => {

    const { tenantId } = req.user; // Extract tenantId from authenticated user
  const { firstName, lastName, email, phoneNumber, status } = req.body;

  // Validate required fields
  if (!tenantId || !firstName || !lastName || !phoneNumber) {
    return res.status(400).json({ message: 'Required fields: tenantId, firstName, lastName, phoneNumber.' });
  }

  // Validate status
  const validStatuses = Object.values(LandlordStatus);
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ message: `Invalid status. Valid values: ${validStatuses.join(', ')}` });
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

    // Check if phone number or email already exists
    const existingLandlord = await prisma.landlord.findFirst({
      where: {
        OR: [{ phoneNumber }, { email: email ?? '' }],
        tenantId,
      },
    });

    if (existingLandlord) {
      return res.status(400).json({ message: 'Phone number or email already exists for this tenant.' });
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

    res.status(201).json({ message: 'Landlord created successfully', landlord });
  } catch (error) {
    console.error('Error creating landlord:', error);

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Phone number or email must be unique.' });
    }

    res.status(500).json({ message: 'Internal server error' });
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

module.exports = { getBuildingsByLandlord , createLandlord , searchLandlords };



