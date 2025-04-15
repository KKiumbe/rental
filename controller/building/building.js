const { PrismaClient } = require('@prisma/client');
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
