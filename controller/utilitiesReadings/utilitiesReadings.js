const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


const createWaterReading = async (req, res) => {
  const { customerId, reading } = req.body;
  const { tenantId } = req.user;

  // Set period to first of current month
  const period = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // Validate required fields
  if (!customerId || reading === undefined) {
    return res.status(400).json({ message: 'Required fields: customerId, reading' });
  }

  // Validate reading
  if (isNaN(reading) || reading < 0) {
    return res.status(400).json({ message: 'Reading must be a non-negative number.' });
  }

  try {
    // Check if customer exists and belongs to tenant
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { Building: true ,unit: true,},
    });

    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Customer not found or does not belong to tenant.' });
    }

    // Check if customer is assigned to a building
    if (!customer.unit || !customer.Building) {
      return res.status(400).json({ message: 'Customer is not assigned to a building.' });
    }


    // Fetch the most recent previous reading for the customer
    const previousReading = await prisma.waterConsumption.findFirst({
      where: { customerId},
      orderBy: { period: 'desc' },
      select: { reading: true },
    });

    // Calculate consumption (current reading - previous reading, or 0 if no previous reading)
    const consumption = previousReading ? parseFloat(reading) - previousReading.reading : 0;

    // Create water consumption record
    const waterReading = await prisma.waterConsumption.create({
      data: {
        customerId,
        period,
        reading: parseFloat(reading),
        consumption,
        tenantId,
      },
    });

    res.status(201).json({ message: 'Water reading created successfully', reading: waterReading });
  } catch (error) {
    console.error('Error creating water reading:', error);
    if (error instanceof prisma.PrismaClientValidationError) {
      return res.status(400).json({ message: 'Invalid data provided for water reading.' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

const createGasReading = async (req, res) => {
  const { customerId, reading } = req.body;
  const { tenantId } = req.user;

  // Set period to first of current month (consistent with createWaterReading)
  const period = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // Validate required fields
  if (!customerId || reading === undefined) {
    return res.status(400).json({ message: 'Required fields: customerId, reading' });
  }

  // Validate reading
  if (isNaN(reading) || reading < 0) {
    return res.status(400).json({ message: 'Reading must be a non-negative number.' });
  }

  try {
    // Check if customer exists and belongs to tenant
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { Building: true ,unit: true,},
    });

    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Customer not found or does not belong to tenant.' });
    }

    // Check if customer is assigned to a building
    if (!customer.Building || !customer.unit) {
      return res.status(400).json({ message: 'Customer is not assigned to a building.' });
    }

    // Check if gasRate is defined
    if (customer.Building.gasRate === null) {
      return res.status(400).json({ message: 'Gas rate is not defined for this building.' });
    }

  

    // Fetch the most recent previous reading for the customer
    const previousReading = await prisma.gasConsumption.findFirst({
      where: { customerId},
      orderBy: { period: 'desc' },
      select: { reading: true },
    });

    // Calculate consumption (current reading - previous reading, or 0 if no previous reading)
    const consumption = previousReading ? parseFloat(reading) - previousReading.reading : 0;

    // Create gas consumption record
    const gasReading = await prisma.gasConsumption.create({
      data: {
        customerId,
        period,
        reading: parseFloat(reading),
        consumption,
        tenantId,
      },
    });

    res.status(201).json({ message: 'Gas reading created successfully', reading: gasReading });
  } catch (error) {
    console.error('Error creating gas reading:', error);
    if (error instanceof prisma.PrismaClientValidationError) {
      return res.status(400).json({ message: 'Invalid data provided for gas reading.' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};



module.exports = { createGasReading, createWaterReading };