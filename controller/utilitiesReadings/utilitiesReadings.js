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
  const { sendSMS } = require('../sms/sms.js');
  const { customerId, reading, meterPhotoUrl } = req.body;
  const { tenantId, user: userId } = req.user;
  const now = new Date();
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, -3)); // EAT month start

  // Validate required fields
  if (!customerId || reading === undefined) {
    return res.status(400).json({ message: 'Required fields: customerId, reading' });
  }

  if (isNaN(reading) || reading < 0) {
    return res.status(400).json({ message: 'Reading must be a non-negative number.' });
  }

  try {
    // Set query timeout (5 seconds for localhost)
    await prisma.$executeRaw`SET statement_timeout = 5000`;

    console.log(`Starting createWaterReading: customerId=${customerId}, reading=${reading}, period=${period.toISOString()}`);

    // Fetch customer with Unit and Building
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        Building: true,
        unit: { include: { building: true } },
      },
    });

    if (!customer || customer.tenantId !== tenantId) {
      console.error(`Customer not found or tenant mismatch: customerId=${customerId}, tenantId=${tenantId}`);
      return res.status(404).json({ message: 'Customer not found or not in tenant.' });
    }

    console.log(`Customer fetched: ${JSON.stringify(customer, null, 2)}`);



    const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { tenantId: true, firstName: true, lastName: true },
          });
          if (!currentUser || currentUser.tenantId !== tenantId) {
            return res.status(404).json({
              success: false,
              message: 'Authenticated user not found or does not belong to tenant.',
            });
          }

    // Use unit.building (prefer over Customer.Building)
    let building = customer.unit?.building;
    if (!building && customer.Building?.length > 0) {
      building = customer.Building[0];
      console.log(`Using Customer.Building[0]: ${JSON.stringify(building, null, 2)}`);
    }

    if (!building) {
      console.error(`No building found for customerId=${customerId}, unitId=${customer.unitId}`);
      return res.status(400).json({ message: 'No building associated with customer.' });
    }

    console.log(`Building: id=${building.id}, billType=${building.billType}, waterRate=${building.waterRate}`);

    // Validate waterRate early
    if (building.billType === 'WATER_ONLY' && (!building.waterRate || building.waterRate <= 0)) {
      console.error(`Invalid water rate: ${building.waterRate} for buildingId=${building.id}`);
      return res.status(400).json({ message: `Invalid water rate (${building.waterRate}) for WATER_ONLY billing.` });
    }

    // Get previous reading
    console.log(`Fetching previous reading for customerId=${customerId}`);
    const previous = await prisma.waterConsumption.findFirst({
      where: { customerId },
      orderBy: { period: 'desc' },
      select: { reading: true },
    });

    // Calculate consumption
    const consumption = previous ? parseFloat(reading) - previous.reading : parseFloat(reading);

    if (previous && consumption < 0) {
      console.error(`Invalid consumption: reading=${reading}, previous=${previous.reading}`);
      return res.status(400).json({ message: 'Current reading must be greater than previous reading.' });
    }

    if (building.billType === 'WATER_ONLY' && consumption <= 0) {
      console.error(`Invalid consumption for invoicing: ${consumption}`);
      return res.status(400).json({ message: 'Consumption must be positive for WATER_ONLY billing.' });
    }

    // Get last 3 consumptions for abnormality check
    console.log(`Fetching recent consumptions for customerId=${customerId}`);
    const recent = await prisma.waterConsumption.findMany({
      where: { customerId },
      orderBy: { period: 'desc' },
      take: 3,
      select: { consumption: true },
    });

    let isNormal = true;
    let avg = 0;
    if (recent.length >= 3) {
      avg = recent.reduce((sum, r) => sum + r.consumption, 0) / recent.length;
      if (consumption > 2 * avg) {
        isNormal = false;
      }
    }

    console.log(`Consumption: ${consumption}, isNormal: ${isNormal}, avg: ${avg}`);

    let result = {};
    let smsError = null;

    // Create water consumption record
    console.log(`Creating water consumption record: customerId=${customerId}, period=${period.toISOString()}`);
    const waterReading = await prisma.waterConsumption.create({
      data: {
        customerId,
        tenantId,
        period,
        reading: parseFloat(reading),
        consumption,
        meterPhotoUrl: meterPhotoUrl || null,
        readById: userId,
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), // EAT: 03:48 PM, July 1, 2025
      },
    });

    result.waterReading = waterReading;

    if (isNormal && building.billType === 'WATER_ONLY') {
      // Generate invoice for WATER_ONLY customers
      const waterRate = building.waterRate;
      const invoiceAmount = consumption * waterRate;

      console.log(`Calculated invoiceAmount: ${invoiceAmount} (consumption=${consumption}, waterRate=${waterRate})`);

      // Check for existing invoice
      // console.log(`Checking for existing invoice: customerId=${customerId}, period=${period.toISOString()}`);
      // const existingInvoice = await prisma.invoice.findFirst({
      //   where: { customerId, invoicePeriod: period, tenantId },
      // });

      // if (existingInvoice) {
      //   console.error(`Invoice already exists: invoiceId=${existingInvoice.id}`);
      //   return res.status(400).json({ message: 'Invoice already exists for this customer and period.' });
      // }

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

      console.log(`Creating invoice: customerId=${customerId}, unitId=${customer.unitId}, buildingId=${building.id}, amount=${invoiceAmount}, waterRate=${waterRate}`);

      const invoice = await prisma.invoice.create({
        data: {
          tenantId,
          customerId,
          unitId: customer.unitId || null,
          invoicePeriod: period,
          invoiceNumber: `INV-WTR-${Date.now()}`,
          invoiceAmount,
          amountPaid: paidAmount,
          invoiceType: InvoiceType.WATER, // Use new enum
          status,
          closingBalance: invoiceAmount - paidAmount,
          isSystemGenerated: true,
           //created by expect a string
          createdBy: `${currentUser.firstName} ${currentUser.lastName}`,

          
          InvoiceItem: {
            create: {
              description: `Water consumption: ${consumption} units`,
              amount: invoiceAmount,
              quantity: 1,
             
            },
          },
        },
      });

      console.log(`Updating customer balance: customerId=${customerId}, newBalance=${newBalance}`);
      await prisma.customer.update({
        where: { id: customerId },
        data: { closingBalance: newBalance },
      });

      result.invoice = invoice;
    } else if (!isNormal) {
      // Save abnormal reading
      console.log(`Creating abnormal reading: waterConsumptionId=${waterReading.id}`);
   
      const abnormal = await prisma.abnormalWaterReading.create({
  data: {
    customerId,
    tenantId,
    period,
    reading: parseFloat(reading),
    consumption,
    meterPhotoUrl: meterPhotoUrl || null,
    readById: userId,
    reviewNotes: `Consumption (${consumption} m³) exceeds 2x average (${avg.toFixed(2)} m³)`,
    resolved: false,
    reviewed: false,
    createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), // EAT
  },
});


      result.abnormalReading = abnormal;
    } else {
      console.log(`No invoice created: building.billType=${building.billType} is not WATER_ONLY`);
    }

    // Send SMS with retries (3 attempts, 2-second timeout each)
    if (customer.phoneNumber) {
      const periodString = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`;
      const message = isNormal
        ? `Dear ${customer.firstName}, your water meter was read for period ${periodString}: ${consumption} units consumed. Invoice: KES ${result.invoice?.invoiceAmount || 0}, Balance: KES ${result.invoice?.closingBalance || customer.closingBalance}.`
        : `Dear ${customer.firstName}, your water meter was read for period ${periodString}: ${consumption} units consumed. Flagged as abnormal (exceeds 2x average of ${avg.toFixed(2)} m³).`;

      console.log(`Attempting SMS to ${customer.phoneNumber}: ${message}`);

      let smsSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const smsResponse = await Promise.race([
            sendSMS(tenantId, customer.phoneNumber, message),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SMS timeout')), 2000)),
          ]);
          if (smsResponse.success) {
            smsSuccess = true;
            console.log(`SMS sent successfully on attempt ${attempt}`);
            break;
          } else {
            smsError = `SMS failed on attempt ${attempt}: ${smsResponse.error || 'Unknown error'}`;
            console.warn(smsError);
          }
        } catch (err) {
          smsError = `SMS failed on attempt ${attempt}: ${err.message}`;
          console.warn(smsError);
        }
      }

      if (!smsSuccess) {
        smsError = smsError || 'All SMS attempts failed.';
        console.error(smsError);
      }
    } else {
      smsError = 'No phone number available for SMS.';
      console.warn(smsError);
    }

    // Log activity (optimized to reduce data size)
    console.log(`Logging activity for waterConsumptionId=${waterReading.id}`);
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: userId } },
        tenant: { connect: { id: tenantId } },
        customer: { connect: { id: customerId } },
        action: 'Created water reading',
        details: {
          waterConsumptionId: waterReading.id,
          reading,
          consumption,
          period: period.toISOString(),
          isNormal,
          invoiceId: result.invoice?.id || null,
          invoiceAmount: result.invoice?.invoiceAmount || null,
          waterRate: building?.waterRate || null,
          unitId: customer.unitId || null,
          buildingId: building?.id || null,
          smsError: smsError || null,
        },
        timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000), // EAT
      },
    });

    res.status(201).json({
      message: isNormal ? 'Normal reading saved.' : 'Abnormal reading saved.',
      reading: result.waterReading,
      invoice: result.invoice || null,
      abnormalReading: result.abnormalReading || null,
      smsError: smsError || null,
    });
  } catch (err) {
    console.error('Error creating water reading:', err, { code: err.code, meta: err.meta });
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Water reading or invoice already exists for this customer and period.' });
    }
    if (err.message.includes('timeout')) {
      return res.status(504).json({ message: 'Database query timed out.' });
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
          unitId: true
        }
      },
      readBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      }
    }
  }),
  prisma.waterConsumption.count({
    where: { tenantId }
  })
]);

       

      res.status(200).json({
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        data: readings
      });

    } catch (err) {
      console.error("Error fetching water readings:", err);
      res.status(500).json({ message: "Failed to fetch water readings" });
    }
  };





const getAllAbnormalWaterReadings = async (req, res) => {
  let { tenantId } = req.user;
  let { page = 1, limit = 20 } = req.query;

  // Validate and parse tenantId
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
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              unitId: true
            }
          },
          readBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }),
      prisma.abnormalWaterReading.count({
        where: { tenantId }
      })
    ]);

    res.status(200).json({
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      data: abnormalReadings
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
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ success: false, data: null, message: 'tenantId is required' });
    }

    let reading = await prisma.waterConsumption.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        readBy: { select: { firstName: true, lastName: true } },
      },
    });

    let isAbnormal = false;
    let anomalyDetails = null;

    if (!reading) {
      reading = await prisma.abnormalWaterReading.findUnique({
        where: { id },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          readBy: { select: { firstName: true, lastName: true } },
        },
      });
      isAbnormal = !!reading;
    }

    if (reading && !isAbnormal) {
      const abnormalRecord = await prisma.abnormalWaterReading.findFirst({
        where: { id, tenantId: parseInt(tenantId) },
      });
      if (abnormalRecord) {
        isAbnormal = true;
        anomalyDetails = {
          reviewed: abnormalRecord.reviewed,
          reviewNotes: abnormalRecord.reviewNotes,
          action: abnormalRecord.action,
          resolved: abnormalRecord.resolved,
          anomalyReason: await computeAnomalyReason(abnormalRecord),
        };
      }
    }

    if (!reading) {
      return res.status(404).json({ success: false, data: null, message: 'Meter reading not found' });
    }

    if (reading.tenantId !== parseInt(tenantId)) {
      return res.status(403).json({ success: false, data: null, message: 'Unauthorized access to reading' });
    }

    // Always fetch average consumption from WaterConsumption using customerId
    const normalReadings = await prisma.waterConsumption.findMany({
      where: {
        customerId: reading.customer.id,
        tenantId: parseInt(tenantId),
      },
      orderBy: { period: 'desc' },
      take: 3,
    });

    let averageConsumption = null;
    if (normalReadings.length > 0) {
      const totalConsumption = normalReadings.reduce((sum, r) => sum + (r.consumption || 0), 0);
      averageConsumption = totalConsumption / normalReadings.length;
    }

    const formattedReading = {
      id: reading.id,
      type: isAbnormal ? 'abnormal' : 'normal',
      customerId: reading.customerId,
      customerName: `${reading.customer.firstName} ${reading.customer.lastName || ''}`.trim(),
      tenantId: reading.tenantId,
      period: reading.period,
      reading: reading.reading,
      consumption: reading.consumption,
      meterPhotoUrl: reading.meterPhotoUrl,
      readById: reading.readById,
      readByName: reading.readBy ? `${reading.readBy.firstName} ${reading.readBy.lastName || ''}`.trim() : null,
      createdAt: reading.createdAt,
      updatedAt: reading.updatedAt,
      isAbnormal,
      anomalyDetails,
      averageConsumption: averageConsumption !== null ? parseFloat(averageConsumption.toFixed(2)) : null,
    };

    res.json({ success: true, data: formattedReading, message: null });
  } catch (error) {
    console.error('Error fetching meter reading:', error);
    res.status(500).json({ success: false, data: null, message: error.message });
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