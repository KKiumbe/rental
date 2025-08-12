const { PrismaClient,BillType ,InvoiceType} = require('@prisma/client');

const prisma = new PrismaClient();

const getStartOfCurrentMonthUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
};






// InvoiceStatus enum
const InvoiceStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  PPAID: 'PPAID',
};




const createWaterReading = async (req, res) => {
  const { customerId, reading, meterPhotoUrl } = req.body;
  const { tenantId, userId, firstName, lastName } = req.user;
  const now = new Date();
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, -3)); // Start of month in EAT

  if (!customerId || reading === undefined) {
    return res.status(400).json({ message: 'Required fields: customerId, reading' });
  }
  if (isNaN(reading) || reading < 0) {
    return res.status(400).json({ message: 'Reading must be a non-negative number.' });
  }

  try {
    await prisma.$executeRaw`SET statement_timeout = 5000`;

    // 🔹 Check duplicate reading for this period
    const existingReading = await prisma.waterConsumption.findFirst({
      where: { customerId, tenantId, period },
    });

    console.log(`there is existingReading ${existingReading}`);
    // if (existingReading) {
    //   return res.status(400).json({ message: 'Water reading already exists for this customer and period.' });
    // }

    // 🔹 Get customer & building
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { unit: { include: { building: true } } },
    });
    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Customer not found or not in tenant.' });
    }
    const building = customer.unit?.building;
    if (!building) {
      return res.status(400).json({ message: 'No building associated with customer.' });
    }

    // 🔹 Previous reading
    const previous = await prisma.waterConsumption.findFirst({
      where: { customerId },
      orderBy: { period: 'desc' },
      select: { reading: true },
    });
    const consumption = previous ? parseFloat(reading) - previous.reading : parseFloat(reading);
    if (previous && consumption < 0) {
      return res.status(400).json({ message: 'Current reading must be greater than previous reading.' });
    }

    // 🔹 Detect abnormal
    const avgResult = await prisma.waterConsumption.aggregate({
      where: { customerId },
      _avg: { consumption: true },
    });
    const avg = avgResult._avg.consumption || 0;
    const isAbnormal = avg > 0 && consumption > avg * 2;

    // 🔹 Create WaterConsumption entry
    const waterReading = await prisma.waterConsumption.create({
      data: {
        customerId,
        tenantId,
        period,
        reading: parseFloat(reading),
        consumption,
        meterPhotoUrl: meterPhotoUrl || null,
        readById: userId,
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), // store as EAT
      },
    });

    // 🔹 If abnormal → save & exit
    if (isAbnormal) {
      await prisma.abnormalWaterReading.create({
        data: {
        
          tenantId,
          customerId,
          reviewed: false,
          resolved: false,
          consumption,
          meterPhotoUrl: meterPhotoUrl || null,
          period,
          readById: userId,
          updatedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
          reading: parseFloat(reading),
         
        },
      });

      return res.status(201).json({
        message: 'Abnormal water reading saved for review. No invoice generated.',
        reading: waterReading,
      });
    }

    // 🔹 Calculate invoice
    const waterRate = building.waterRate || 0;
    const invoiceAmount = consumption * waterRate;
    const currentBalance = customer.closingBalance || 0;
    const newBalance = currentBalance + invoiceAmount;

    let status = InvoiceStatus.UNPAID;
    let paidAmount = 0;
    if (newBalance === 0) {
      status = InvoiceStatus.PAID;
      paidAmount = invoiceAmount;
    } else if (newBalance > 0 && newBalance < invoiceAmount) {
      status = InvoiceStatus.PPAID;
      paidAmount = Math.abs(currentBalance);
    }

    // 🔹 Create invoice & update balance in a transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.invoice.create({
        data: {
          tenantId,
          customerId,
          unitId: customer.unitId || null,
          invoicePeriod: period,
          invoiceNumber: `INV-WTR-${Date.now()}`,
          invoiceAmount,
          amountPaid: paidAmount,
          invoiceType: InvoiceType.WATER,
          status,
          closingBalance: invoiceAmount - paidAmount,
          isSystemGenerated: true,
          createdBy: `${firstName} ${lastName}`,
          InvoiceItem: {
            create: {
              description: `Water consumption: ${consumption} units`,
              amount: invoiceAmount,
              quantity: 1,
            },
          },
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: { closingBalance: newBalance },
      });

      return createdInvoice;
    });

    // 🔹 Send SMS notification
    try {
      const smsMessage = `Dear ${customer.firstName}, your Water Bill:
Prev reading: ${previous?.reading ?? 0} units
Current reading: ${reading} units , Consumption: ${consumption} units, rate: ${waterRate.toFixed(2)}
Invoice amount: ${invoiceAmount.toFixed(2)}`;
      await sendSms({
        to: customer.phoneNumber, // must exist in DB
        message: smsMessage,
      });
    } catch (smsErr) {
      console.error('SMS send failed:', smsErr);
    }

    // ✅ Response
    res.status(201).json({
      message: 'Water reading and invoice created successfully.',
      reading: waterReading,
      invoice,
    });

  } catch (err) {
    console.error('Error creating water reading:', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Duplicate water reading for this customer and period.' });
    }
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    await prisma.$executeRaw`RESET statement_timeout`;
    await prisma.$disconnect();
  }
};


const getAllWaterReadings = async (req, res) => {
  const { tenantId } = req.user;
  let { page = 1, limit = 20 } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;

  const skip = (page - 1) * limit;

  try {
    const [readings, totalCount] = await Promise.all([
      prisma.waterConsumption.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true,
            },
          },
          User: {  // ✅ this matches your model relation
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.waterConsumption.count({
        where: { tenantId },
      }),
    ]);

     console.log(`this are the readings ${JSON.stringify(readings)}`);

     const waterMeterReadBy = await prisma.user.findFirst({
       where: { id: readings[0]?.readById },
       select: {
         id: true,
         firstName: true,
         lastName: true,
       },
     })

    res.status(200).json({
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      data: readings.map((reading) => ({ ...reading, readBy: waterMeterReadBy})), // add readBy property to each readings,
    });

   
  } catch (err) {
    console.error("Error fetching water readings:", err);
    res.status(500).json({ message: "Failed to fetch water readings" });
  }
};





const getAllAbnormalWaterReadings = async (req, res) => {
  let { tenantId } = req.user;
  let { page = 1, limit = 20 } = req.query;

  tenantId = parseInt(tenantId);
  if (isNaN(tenantId)) {
    return res.status(400).json({ message: "Invalid tenantId" });
  }

  page = parseInt(page);
  limit = parseInt(limit);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;

  const skip = (page - 1) * limit;

  try {
    const [abnormalReadings, totalCount] = await Promise.all([
      prisma.abnormalWaterReading.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          User: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          Customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true
            }
          }
        }
      }),
      prisma.abnormalWaterReading.count({ where: { tenantId } })
    ]);

    res.status(200).json({
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      data: abnormalReadings.map((reading) => ({
        ...reading,
        readBy: reading.User,
        customer: reading.Customer
      }))
    });
  } catch (err) {
    console.error("Error fetching abnormal water readings:", err);
    res.status(500).json({ message: "Failed to fetch abnormal water readings" });
  }
};


const reviewAbnormalWaterReading = async (req, res) => {
  const { id } = req.params;
  const { action, reviewNotes } = req.body;
  const { tenantId } = req.user;

  if (!action || !['REQUEST_READING', 'DISCUSS_CONSUMPTION', 'METER_MAINTENANCE'].includes(action)) {
    return res.status(400).json({ message: 'Invalid or missing review action.' });
  }

  try {
    const abnormal = await prisma.abnormalWaterReading.findUnique({
      where: { id },
      include: { waterConsumption: true }
    });

    if (!abnormal || abnormal.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Abnormal reading not found' });
    }

    const updated = await prisma.abnormalWaterReading.update({
      where: { id },
      data: {
        reviewed: true,
        action,
        reviewNotes: reviewNotes || null
      }
    });

    res.status(200).json({
      message: 'Abnormal reading reviewed successfully',
      abnormalReading: updated
    });
  } catch (err) {
    console.error('Error reviewing abnormal reading:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};



const resolveAbnormalWaterReading = async (req, res) => {
  const { id } = req.params; // abnormal reading ID
  const { newReading, meterPhotoUrl, resolutionNote } = req.body;
  const { tenantId, user: userId } = req.user;

  if (newReading === undefined || isNaN(newReading) || newReading < 0) {
    return res.status(400).json({ message: 'A valid newReading is required.' });
  }

  try {
    const abnormal = await prisma.abnormalWaterReading.findUnique({
      where: { id },
      include: {
        waterConsumption: {
          include: {
            customer: { select: { id: true, tenantId: true, closingBalance: true, phoneNumber: true } },
            building: true,
          },
        },
      },
    });

    if (!abnormal || abnormal.tenantId !== tenantId) {
      return res.status(404).json({ message: 'Abnormal reading not found.' });
    }

    const consumptionRecord = abnormal.waterConsumption;
    const customer = consumptionRecord.customer;

    const previous = await prisma.waterConsumption.findFirst({
      where: {
        customerId: customer.id,
        tenantId,
        period: { lt: consumptionRecord.period },
      },
      orderBy: { period: 'desc' },
    });

    if (previous && parseFloat(newReading) < previous.reading) {
      await prisma.abnormalWaterReading.update({
        where: { id },
        data: {
          reviewed: true,
          resolved: false,
          note: resolutionNote || 'Manual update required: new reading less than previous reading.',
          attemptedReading: parseFloat(newReading),
          meterPhotoUrl: meterPhotoUrl || abnormal.meterPhotoUrl,
        },
      });

      return res.status(400).json({
        message: 'New reading is less than previous reading. Manual update required.',
        previousReading: previous.reading,
        attemptedNewReading: parseFloat(newReading),
      });
    }

    const consumption = previous ? parseFloat(newReading) - previous.reading : parseFloat(newReading);

    // Update the water consumption
    await prisma.waterConsumption.update({
      where: { id: consumptionRecord.id },
      data: {
        reading: parseFloat(newReading),
        consumption,
        meterPhotoUrl: meterPhotoUrl || consumptionRecord.meterPhotoUrl,
      },
    });

    // Update abnormal record
    await prisma.abnormalWaterReading.update({
      where: { id },
      data: {
        resolved: true,
        reviewed: true,
        note: resolutionNote || 'Reading updated and resolved',
        updatedAt: new Date(),
      },
    });

    // Generate invoice for WATER_ONLY customers
    let invoice = null;
    let invoiceAmount = 0;
    let newClosingBalance = customer.closingBalance || 0;
    let waterRate = 0;
    let status = InvoiceStatus.UNPAID;
    let smsError = null;

    if (!consumptionRecord.unitId && consumptionRecord.building?.billType === 'WATER_ONLY') {
      waterRate = consumptionRecord.building?.waterRate || 0;
      invoiceAmount = consumption * waterRate;

      if (invoiceAmount > 0) {
        // Check for existing invoice
        const existingInvoice = await prisma.invoice.findFirst({
          where: { customerId: customer.id, invoicePeriod: consumptionRecord.period, tenantId },
        });

        if (existingInvoice) {
          return res.status(400).json({ message: 'Invoice already exists for this customer and period.' });
        }

        // Determine invoice status
        const currentClosingBalance = customer.closingBalance || 0;
        newClosingBalance = currentClosingBalance + invoiceAmount;

        if (newClosingBalance < 0 && Math.abs(currentClosingBalance) >= invoiceAmount) {
          status = InvoiceStatus.PAID;
        } else if (newClosingBalance === 0) {
          status = InvoiceStatus.PAID;
        } else if (newClosingBalance > 0 && newClosingBalance < invoiceAmount) {
          status = InvoiceStatus.PPAID;
        }

        const invoiceNumber = `INV-WTR-${Date.now()}`;
        invoice = await prisma.invoice.create({
          data: {
            tenantId,
            customerId: customer.id,
            invoicePeriod: consumptionRecord.period,
            invoiceNumber,
            invoiceAmount,
            amountPaid: status === InvoiceStatus.PAID ? invoiceAmount : status === InvoiceStatus.PPAID ? Math.abs(currentClosingBalance) : 0,
            status,
            closingBalance: invoiceAmount - (status === InvoiceStatus.PAID ? invoiceAmount : status === InvoiceStatus.PPAID ? Math.abs(currentClosingBalance) : 0),
            isSystemGenerated: true,
            createdBy: userId.toString(),
            InvoiceItem: {
              create: {
                description: `Water consumption: ${consumption} units`,
                amount: invoiceAmount,
                quantity: 1,
              },
            },
          },
        });

        // Update customer's balance
        await prisma.customer.update({
          where: { id: customer.id },
          data: { closingBalance: newClosingBalance },
        });
      }
    }

    // Send SMS notification
    if (customer.phoneNumber) {
      const periodString = `${consumptionRecord.period.getUTCFullYear()}-${String(consumptionRecord.period.getUTCMonth() + 1).padStart(2, '0')}`;
      let message;

      if (invoice && consumptionRecord.building?.billType === 'WATER_ONLY' && !consumptionRecord.unitId) {
        message = `Dear customer, your meter was read today for period ${periodString}: ${consumption} units consumed, KES ${waterRate} per unit, KES ${invoiceAmount} shillings, total KES ${invoiceAmount}. Your balance is KES ${newClosingBalance}.`;
      } else {
        message = `Dear customer, your meter was read today for period ${periodString}: ${consumption} units consumed.`;
      }

      const smsResponses = await sendSMS(tenantId, customer.phoneNumber, message);
      if (!smsResponses.success) {
        smsError = `SMS failed: ${smsResponses.error || 'Unknown error'}`;
      }
    } else {
      smsError = 'No phone number available for SMS.';
    }

    // Log user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: userId } },
        tenant: { connect: { id: tenantId } },
        customer: { connect: { id: customer.id } },
        action: 'Resolved abnormal water reading',
        details: {
          abnormalId: id,
          waterConsumptionId: consumptionRecord.id,
          newReading,
          consumption,
          invoiceId: invoice ? invoice.id : null,
          invoiceAmount: invoice ? invoiceAmount : null,
          waterRate: invoice ? waterRate : null,
          invoiceStatus: invoice ? status : null,
          newClosingBalance: invoice ? newClosingBalance : null,
          smsError: smsError || null,
          phoneNumber: customer.phoneNumber || null,
        },
        timestamp: new Date(),
      },
    });

    res.status(200).json({
      message: 'Abnormal reading resolved successfully.',
      updatedReading: parseFloat(newReading),
      consumption,
      invoice: invoice || null,
      smsError: smsError || null,
    });
  } catch (err) {
    console.error('Error resolving abnormal water reading:', err);
    res.status(500).json({ message: 'Failed to resolve abnormal reading.' });
  } finally {
    await prisma.$disconnect();
  }
};


const manualUpdateMeterReading = async (req, res) => {
  const { tenantId } = req.user;
  const { customerId } = req.params;
  const { newReading, period, meterPhotoUrl } = req.body;

  if (!newReading || !period) {
    return res.status(400).json({ message: "newReading and period are required." });
  }

  try {
    // Find the latest water consumption record (if any)
    const latestReading = await prisma.waterConsumption.findFirst({
      where: { tenantId, customerId },
      orderBy: { period: 'desc' }
    });

    let consumption = 0;

    if (latestReading) {
      if (newReading < latestReading.reading) {
        // New meter: reading is reset or replaced
        consumption = newReading; // Start fresh
      } else {
        // If it's not a new meter, calculate difference
        consumption = newReading - latestReading.reading;
      }
    } else {
      // No previous history: treat as first reading
      consumption = newReading;
    }

    // Save new reading
    const newRecord = await prisma.waterConsumption.create({
      data: {
        tenantId,
        customerId,
        period: new Date(period),
        reading: newReading,
        consumption,
        meterPhotoUrl: meterPhotoUrl || null
      }
    });

    res.status(201).json({
      message: "Manual meter reading recorded successfully.",
      data: newRecord
    });

  } catch (err) {
    console.error("Error in manualUpdateMeterReading:", err);
    res.status(500).json({ message: "Failed to update meter reading." });
  }
};


const getWaterReadingsByCustomer = async (req, res) => {
  const { tenantId } = req.user;
  const { customerId, page = 1, limit = 20 } = req.query;

  if (!tenantId) {
    return res.status(400).json({ message: "Tenant ID is required" });
  }

  if (!customerId) {
    return res.status(400).json({ message: "Customer ID is required" });
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  if (isNaN(pageNum) || pageNum < 1) {
    return res.status(400).json({ message: "Invalid page number" });
  }
  if (isNaN(limitNum) || limitNum < 1) {
    return res.status(400).json({ message: "Invalid limit" });
  }

  const skip = (pageNum - 1) * limitNum;

  try {
    const [readings, totalCount] = await Promise.all([
      prisma.waterConsumption.findMany({
        where: {
          tenantId,
          customerId,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true,
            },
          },
          readBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          AbnormalWaterReading: {
            select: {
              id: true,
              reviewed: true,
              reviewNotes: true,
              action: true,
              resolved: true,
            },
          },
        },
      }),
      prisma.waterConsumption.count({
        where: {
          tenantId,
          customerId,
        },
      }),
    ]);

    if (readings.length === 0) {
      return res.status(404).json({ message: "No water readings found for this customer" });
    }

    res.status(200).json({
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
      totalCount,
      data: readings,
    });
  } catch (error) {
    console.error("Error fetching water readings by customer:", error);
    res.status(500).json({ message: "Failed to fetch water readings", error: error.message });
  }
};

// Route








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





//searches 




// Helper function to validate pagination parameters
const validatePagination = (page, limit) => {
  const pageNum = parseInt(page, 10) || 1;
  const pageSize = parseInt(limit, 10) || 20;
  if (pageNum < 1 || pageSize < 1) {
    throw new Error('Invalid page or limit parameters');
  }
  return { pageNum, pageSize };
};

// Helper function to format water readings
const formatWaterReadings = (readings) => {
  return readings.map((reading) => ({
    id: reading.id,
    customer: {
      firstName: reading.customer.firstName,
      lastName: reading.customer.lastName || '',
      phoneNumber: reading.customer.phoneNumber,
      unitId: reading.customer.unitId || 'N/A',
    },
    reading: reading.reading,
    consumption: reading.consumption,
    period: reading.period,
    readBy: reading.readBy
      ? { firstName: reading.readBy.firstName, lastName: reading.readBy.lastName }
      : null,
    meterPhotoUrl: reading.meterPhotoUrl || null,
    createdAt: reading.createdAt,
    AbnormalWaterReading: reading.AbnormalWaterReading || [],
  }));
};

// Helper function to format abnormal water readings
const formatAbnormalWaterReadings = (readings) => {
  return readings.map((reading) => ({
    id: reading.id,
    customer: {
      firstName: reading.customer.firstName,
      lastName: reading.customer.lastName || '',
      phoneNumber: reading.customer.phoneNumber,
      unitId: reading.customer.unitId || 'N/A',
    },
    reading: reading.reading,
    consumption: reading.consumption,
    period: reading.period,
    readBy: reading.readBy
      ? { firstName: reading.readBy.firstName, lastName: reading.readBy.lastName }
      : null,
    meterPhotoUrl: reading.meterPhotoUrl || null,
    reviewed: reading.reviewed,
    resolved: reading.resolved,
    reviewNotes: reading.reviewNotes || null,
    action: reading.action || null,
    createdAt: reading.createdAt,
  }));
};

// Search water readings by phone number
const searchWaterReadingsByPhone = async (req, res) => {
  try {
    const { phone, page, limit } = req.query;
    const { pageNum, pageSize } = validatePagination(page, limit);

    if (!phone || !/^\d+$/.test(phone.trim())) {
      return res.status(400).json({ message: 'Valid phone number is required' });
    }

    const skip = (pageNum - 1) * pageSize;

    const [readings, totalCount] = await Promise.all([
      prisma.waterConsumption.findMany({
        where: {
          tenantId: req.user.tenantId,
          customer: {
            phoneNumber: phone.trim(),
          },
        },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true,
            },
          },
          readBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          AbnormalWaterReading: {
            select: {
              id: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.waterConsumption.count({
        where: {
          tenantId: req.user.tenantId,
          customer: {
            phoneNumber: phone.trim(),
          },
        },
      }),
    ]);

    const formattedReadings = formatWaterReadings(readings);

    res.json({
      data: formattedReadings,
      totalCount,
    });
  } catch (error) {
    console.error('Error fetching water readings by phone:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch water readings' });
  }
};

// Search abnormal water readings by phone number
const searchAbnormalWaterReadingsByPhone = async (req, res) => {
  try {
    const { phone, page, limit } = req.query;
    const { pageNum, pageSize } = validatePagination(page, limit);

    if (!phone || !/^\d+$/.test(phone.trim())) {
      return res.status(400).json({ message: 'Valid phone number is required' });
    }

    const skip = (pageNum - 1) * pageSize;

    const [readings, totalCount] = await Promise.all([
      prisma.abnormalWaterReading.findMany({
        where: {
          tenantId: req.user.tenantId,
          customer: {
            phoneNumber: phone.trim(),
          },
        },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true,
            },
          },
          readBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.abnormalWaterReading.count({
        where: {
          tenantId: req.user.tenantId,
          customer: {
            phoneNumber: phone.trim(),
          },
        },
      }),
    ]);

    const formattedReadings = formatAbnormalWaterReadings(readings);

    res.json({
      data: formattedReadings,
      totalCount,
    });
  } catch (error) {
    console.error('Error fetching abnormal water readings by phone:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch abnormal water readings' });
  }
};

// Search water readings by name
const searchWaterReadingsByName = async (req, res) => {
  try {
    const { firstName, lastName, page, limit } = req.query;
    const { pageNum, pageSize } = validatePagination(page, limit);

    if (!firstName) {
      return res.status(400).json({ message: 'First name is required' });
    }

    const skip = (pageNum - 1) * pageSize;

    const where = {
      tenantId: req.user.tenantId,
      customer: {
        firstName: { contains: firstName.trim(), mode: 'insensitive' },
      },
    };
    if (lastName) {
      where.customer.lastName = { contains: lastName.trim(), mode: 'insensitive' };
    }

    const [readings, totalCount] = await Promise.all([
      prisma.waterConsumption.findMany({
        where,
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true,
            },
          },
          readBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          AbnormalWaterReading: {
            select: {
              id: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.waterConsumption.count({ where }),
    ]);

    const formattedReadings = formatWaterReadings(readings);

    res.json({
      data: formattedReadings,
      totalCount,
    });
  } catch (error) {
    console.error('Error fetching water readings by name:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch water readings' });
  }
};

// Search abnormal water readings by name
const searchAbnormalWaterReadingsByName = async (req, res) => {
  try {
    const { firstName, lastName, page, limit } = req.query;
    const { pageNum, pageSize } = validatePagination(page, limit);

    if (!firstName) {
      return res.status(400).json({ message: 'First name is required' });
    }

    const skip = (pageNum - 1) * pageSize;

    const where = {
      tenantId: req.user.tenantId,
      customer: {
        firstName: { contains: firstName.trim(), mode: 'insensitive' },
      },
    };
    if (lastName) {
      where.customer.lastName = { contains: lastName.trim(), mode: 'insensitive' };
    }

    const [readings, totalCount] = await Promise.all([
      prisma.abnormalWaterReading.findMany({
        where,
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true,
            },
          },
          readBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.abnormalWaterReading.count({ where }),
    ]);

    const formattedReadings = formatAbnormalWaterReadings(readings);

    res.json({
      data: formattedReadings,
      totalCount,
    });
  } catch (error) {
    console.error('Error fetching abnormal water readings by name:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch abnormal water readings' });
  }
};




const getMeterReadingDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'tenantId is required' });
    }

    // Try normal reading first
    let reading = await prisma.waterConsumption.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        User: { select: { firstName: true, lastName: true } }
      }
    });

    let isAbnormal = false;
    let anomalyDetails = null;

    // If not found in normal, check abnormal
    if (!reading) {
      reading = await prisma.abnormalWaterReading.findUnique({
        where: { id },
        include: {
          Customer: { select: { id: true, firstName: true, lastName: true } },
          User: { select: { firstName: true, lastName: true } }
        }
      });
      if (reading) isAbnormal = true;
    }

    // If normal reading found, check if it has a matching abnormal record for same customer+period
    if (reading && !isAbnormal) {
      const abnormalRecord = await prisma.abnormalWaterReading.findFirst({
        where: {
          customerId: reading.customer.id,
          period: reading.period,
          tenantId: parseInt(tenantId)
        }
      });
      if (abnormalRecord) {
        isAbnormal = true;
        anomalyDetails = {
          reviewed: abnormalRecord.reviewed,
          reviewNotes: abnormalRecord.reviewNotes,
          action: abnormalRecord.action,
          resolved: abnormalRecord.resolved
        };
      }
    }

    if (!reading) {
      return res.status(404).json({ success: false, message: 'Meter reading not found' });
    }

    if (reading.tenantId !== parseInt(tenantId)) {
      return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    // Average consumption (last 3)
    const normalReadings = await prisma.waterConsumption.findMany({
      where: {
        customerId: reading.customer.id,
        tenantId: parseInt(tenantId)
      },
      orderBy: { period: 'desc' },
      take: 3
    });

    let avgConsumption = null;
    if (normalReadings.length > 0) {
      avgConsumption =
        normalReadings.reduce((sum, r) => sum + (r.consumption || 0), 0) / normalReadings.length;
    }

    res.json({
      success: true,
      data: {
        id: reading.id,
        type: isAbnormal ? 'abnormal' : 'normal',
        customerId: reading.customer?.id || reading.Customer?.id,
        customerName: `${reading.customer?.firstName || reading.Customer?.firstName} ${reading.customer?.lastName || reading.Customer?.lastName || ''}`.trim(),
        tenantId: reading.tenantId,
        period: reading.period,
        reading: reading.reading,
        consumption: reading.consumption,
        meterPhotoUrl: reading.meterPhotoUrl,
        readByName: reading.User ? `${reading.User.firstName} ${reading.User.lastName}` : null,
        isAbnormal,
        anomalyDetails,
        averageConsumption: avgConsumption !== null ? parseFloat(avgConsumption.toFixed(2)) : null
      }
    });
  } catch (error) {
    console.error('Error fetching meter reading:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// Compute anomaly reason (customizable)
async function computeAnomalyReason(reading) {
  const history = await prisma.waterConsumption.findMany({
    where: {
      customerId: reading.customerId,
      period: { gte: new Date(new Date().setDate(new Date().getDate() - 7)) },
    },
  });
  const average = history.length > 0 ? history.reduce((sum, r) => sum + r.consumption, 0) / history.length : 0;
  if (reading.reading === 0) return 'Zero reading detected (potential meter failure)';
  if (average > 0 && Math.abs(reading.reading - average) / average > 0.5) {
    return `Reading ${reading.reading} is ${(reading.reading / average * 100 - 100).toFixed(2)}% above average (${average.toFixed(2)})`;
  }
  return 'Reading flagged as abnormal';
}



module.exports = { createGasReading, createWaterReading,getAllAbnormalWaterReadings, reviewAbnormalWaterReading, resolveAbnormalWaterReading, getAllWaterReadings , manualUpdateMeterReading ,getWaterReadingsByCustomer

, searchWaterReadingsByPhone, searchAbnormalWaterReadingsByPhone, searchWaterReadingsByName, searchAbnormalWaterReadingsByName, getMeterReadingDetails
};