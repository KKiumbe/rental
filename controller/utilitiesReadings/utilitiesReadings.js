const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();



const createWaterReading = async (req, res) => {
  const { customerId, consumption } = req.body;
  const { tenantId } = req.user;

  // Set period to first of current month (align with invoiceCreate)
  const period = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // Validate required fields
  if (!customerId || consumption === undefined) {
    return res.status(400).json({ message: 'Required fields: customerId, consumption' });
  }

  // Validate consumption
  if (isNaN(consumption) || consumption < 0) {
    return res.status(400).json({ message: 'Consumption must be a non-negative number.' });
  }

  try {
    // Check if customer exists and belongs to tenant
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { building: true },
    });

    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Customer not found or does not belong to tenant.' });
    }

    // Check if customer is assigned to a building
    if (!customer.buildingId || !customer.building) {
      return res.status(400).json({ message: 'Customer is not assigned to a building.' });
    }

    // Check if reading exists for this period
    const existingReading = await prisma.waterConsumption.findFirst({
      where: { customerId, period },
    });

    if (existingReading) {
      return res.status(400).json({ message: 'Water reading already exists for this customer and period.' });
    }

    // Create water consumption record
    const reading = await prisma.waterConsumption.create({
      data: {
        customerId,
        period,
        consumption: parseFloat(consumption),
      },
    });

    res.status(201).json({ message: 'Water reading created successfully', reading });
  } catch (error) {
    console.error('Error creating water reading:', error);
    if (error instanceof prisma.PrismaClientValidationError) {
      return res.status(400).json({ message: 'Invalid data provided for water reading.' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};




const createGasReading = async (req, res) => {
  const { customerId, consumption } = req.body;
  const { tenantId } = req.user;

  // Validate required fields
  if (!customerId ) {
    return res.status(400).json({ message: 'Required fields: customerId.' });
  }

  // Validate consumption
  if (isNaN(consumption) || consumption < 0) {
    return res.status(400).json({ message: 'Consumption must be a non-negative number.' });
  }

  try {
    // Check if customer exists and belongs to tenant
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { building: true },
    });

    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Customer not found or does not belong to tenant.' });
    }

    // Check if customer is assigned to a building
    if (!customer.buildingId || !customer.building) {
      return res.status(400).json({ message: 'Customer is not assigned to a building.' });
    }

    // Check if gasRate is defined
    if (customer.building.gasRate === null) {
      return res.status(400).json({ message: 'Gas rate is not defined for this building.' });
    }



  

    // Create gas consumption record
    const reading = await prisma.gasConsumption.create({
      data: {
        customerId,
        period: new Date(period),
        consumption: parseFloat(consumption),
       
       
      },
    });

    res.status(201).json({ message: 'Gas reading created successfully', reading });
  } catch (error) {
    console.error('Error creating gas reading:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { createGasReading, createWaterReading };