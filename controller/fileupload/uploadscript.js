// controllers/customerController.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient, CustomerStatus, LandlordStatus, UnitStatus} = require('@prisma/client');
const prisma = new PrismaClient();


const fsPromises = require('fs').promises;



// Create uploads directory and leases subdirectory if they don't exist
const uploadsDir = path.join(__dirname, '..', 'Uploads');
const leasesDir = path.join(uploadsDir, 'leases');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(UploadsDir, { recursive: true });
}
if (!fs.existsSync(leasesDir)) {
  fs.mkdirSync(leasesDir, { recursive: true });
}



// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, leasesDir); // Store lease files in Uploads/leases/
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueSuffix);
  },
});






const fileFilter = (req, file, cb) => {
  const allowedTypes = req.path.includes('upload-landlord') || req.path.includes('upload-customers')
    ? ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    : ['application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only ${allowedTypes.join(' or ')} files are allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const sanitizePhoneNumber = (phone) => {
  if (typeof phone !== 'string') return '';
  if (phone.startsWith('+254')) return '0' + phone.slice(4);
  if (phone.startsWith('254')) return '0' + phone.slice(3);
   if (phone.startsWith('7')) return '0' + phone;
     if (phone.startsWith('1')) return '0' + phone;
  return phone.trim();
};

const uploadCustomers = async (req, res) => {
  const { tenantId, user: userId } = req.user;

  if (!tenantId || !userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Tenant or User ID missing' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const customersToCreate = [];
  const errors = [];

  try {
    const existingCustomers = await prisma.customer.findMany({
      where: { tenantId },
      select: { phoneNumber: true },
    });
    const existingPhoneNumbers = new Set(existingCustomers.map(c => c.phoneNumber));

    const processFile = () => {
      return new Promise((resolve, reject) => {
        if (req.file.mimetype.includes('spreadsheetml')) {
          // Parse Excel file
          const workbook = new ExcelJS.Workbook();
          workbook.xlsx.readFile(filePath)
            .then(() => {
              const worksheet = workbook.getWorksheet(1);
              const headers = {};
              worksheet.getRow(1).eachCell((cell, colNumber) => {
                headers[cell.text] = colNumber;
              });
              const rows = [];
              worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header row
                const rowData = {};
                Object.keys(headers).forEach((header) => {
                  rowData[header] = row.getCell(headers[header]).text || '';
                });
                rows.push(rowData);
              });
              resolve(rows);
            })
            .catch(reject);
        } else {
          // Parse CSV file
          const rows = [];
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
        }
      });
    };

    const rows = await processFile();

    const requiredHeaders = ['firstName', 'lastName', 'phoneNumber', 'landlordPhoneNumber', 'buildingName', 'unitNumber'];
    const headers = Object.keys(rows[0] || {});
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    if (missingHeaders.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: `Missing required headers: ${missingHeaders.join(', ')}` });
    }

    const csvPhoneNumbers = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // Account for header row
      try {
        const sanitizedPhoneNumber = sanitizePhoneNumber(row.phoneNumber);
        const landlordPhoneNumber = sanitizePhoneNumber(row.landlordPhoneNumber);

        if (!sanitizedPhoneNumber) {
          errors.push({ row: rowNumber, reason: 'Missing customer phone number' });
          continue;
        }

        if (csvPhoneNumbers.has(sanitizedPhoneNumber)) {
          errors.push({ row: rowNumber, reason: `Duplicate phone number ${sanitizedPhoneNumber} within file` });
          continue;
        }

        if (existingPhoneNumbers.has(sanitizedPhoneNumber)) {
          errors.push({ row: rowNumber, reason: `Phone number ${sanitizedPhoneNumber} already exists in database` });
          continue;
        }

        csvPhoneNumbers.add(sanitizedPhoneNumber);

        let landlord = await prisma.landlord.findFirst({
          where: { tenantId, phoneNumber: landlordPhoneNumber },
        });

        if (!landlord) {
          if (!row.landlordFirstName || !row.landlordLastName) {
            errors.push({ row: rowNumber, reason: 'Missing landlord firstName or lastName' });
            continue;
          }
          landlord = await prisma.landlord.create({
            data: {
              id: uuidv4(),
              tenantId,
              firstName: row.landlordFirstName.trim(),
              lastName: row.landlordLastName.trim(),
              phoneNumber: landlordPhoneNumber,
              status: LandlordStatus.ACTIVE,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          await prisma.auditLog.create({
            data: {
              id: uuidv4(),
              tenantId,
              userId: parseInt(userId),
              action: 'CREATE',
              resource: 'LANDLORD',
              description: `Landlord ${landlord.firstName} ${landlord.lastName} created`,
              details: {
                landlordId: landlord.id,
                firstName: landlord.firstName,
                lastName: landlord.lastName,
                phoneNumber: landlord.phoneNumber,
              },
              createdAt: new Date(),
            },
          });
        }

        const buildingName = row.buildingName?.trim();
        if (!buildingName) {
          errors.push({ row: rowNumber, reason: 'Missing building name' });
          continue;
        }

        let building = await prisma.building.findFirst({
          where: { tenantId, landlordId: landlord.id, name: buildingName },
        });

        if (!building) {
          building = await prisma.building.create({
            data: {
              id: uuidv4(),
              tenantId,
              landlordId: landlord.id,
              name: buildingName,
              billGarbage: row.billGarbage?.toLowerCase() === 'true',
              allowWaterBillingWithAverages: row.allowWaterBillingWithAverages?.toLowerCase() === 'true',
              billSecurity: row.billSecurity?.toLowerCase() === 'true',
              billAmenities: row.billAmenities?.toLowerCase() === 'true',
              billBackupGenerator: row.billBackupGenerator?.toLowerCase() === 'true',
              billWater: row.billWater?.toLowerCase() === 'true',
              billServiceCharge: row.billServiceCharge?.toLowerCase() === 'true',
              waterRate: row.waterRate ? parseFloat(row.waterRate) : null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }

        const unitNumber = row.unitNumber?.trim();
        if (!unitNumber) {
          errors.push({ row: rowNumber, reason: 'Missing unit number' });
          continue;
        }

        let unit = await prisma.unit.findFirst({
          where: { tenantId, buildingId: building.id, unitNumber },
        });

        if (!unit) {
          unit = await prisma.unit.create({
            data: {
              id: uuidv4(),
              tenantId,
              buildingId: building.id,
              unitNumber,
              monthlyCharge: parseFloat(row.monthlyCharge) || 0,
              depositAmount: row.depositAmount ? parseFloat(row.depositAmount) : 0,
              garbageCharge: row.garbageCharge ? parseFloat(row.garbageCharge) : null,
              serviceCharge: row.serviceCharge ? parseFloat(row.serviceCharge) : null,
              securityCharge: row.securityCharge ? parseFloat(row.securityCharge) : null,
              amenitiesCharge: row.amenitiesCharge ? parseFloat(row.amenitiesCharge) : null,
              backupGeneratorCharge: row.backupGeneratorCharge ? parseFloat(row.backupGeneratorCharge) : null,
              status: UnitStatus.OCCUPIED,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }

        customersToCreate.push({
          id: uuidv4(),
          tenantId,
          firstName: row.firstName?.trim() || '',
          lastName: row.lastName?.trim() || '',
          phoneNumber: sanitizedPhoneNumber,
          unitId: unit.id,
          closingBalance: parseFloat(row.closingBalance) || 0,
          status: CustomerStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error(`Row ${rowNumber} error:`, err);
        errors.push({ row: rowNumber, reason: err.message });
      }
    }

    if (customersToCreate.length > 0) {
      await prisma.$transaction([
        prisma.customer.createMany({
          data: customersToCreate,
          skipDuplicates: true,
        }),
        ...customersToCreate.map((customer) =>
          prisma.auditLog.create({
            data: {
              id: uuidv4(),
              tenantId,
              userId: parseInt(userId),
              customerId: customer.id,
              action: 'CREATE',
              resource: 'CUSTOMER',
              description: `Customer ${customer.firstName} ${customer.lastName} created`,
              details: {
                customerId: customer.id,
                firstName: customer.firstName,
                lastName: customer.lastName,
                phoneNumber: customer.phoneNumber,
                unitId: customer.unitId,
              },
              createdAt: new Date(),
            },
          })
        ),
      ]);
    }

    fs.unlinkSync(filePath); // Clean up uploaded file
    res.status(200).json({
      success: true,
      message: `${customersToCreate.length} customer(s) created successfully`,
      errors: errors.length > 0 ? errors : null,
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, message: 'Error uploading customers', error: error.message });
  }
};



async function uploadCustomersWithBuilding(req, res) {
  const { tenantId, user: userId } = req.user;
  const { buildingId } = req.body; // Get buildingId from request body

  try {
    // Validate tenantId, userId, and buildingId
    if (!tenantId || !userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Tenant or User ID missing' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (!buildingId) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Missing buildingId in request body' });
    }

    // Verify building exists and belongs to tenant
    const building = await prisma.building.findFirst({
      where: { id: buildingId, tenantId },
    });
    if (!building) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `Building with ID ${buildingId} not found or does not belong to tenant` });
    }

    const filePath = req.file.path;
    const customersToCreate = [];
    const errors = [];
    const auditLogs = [];

    // Fetch existing customers for duplicate phone number check
    const existingCustomers = await prisma.customer.findMany({
      where: { tenantId },
      select: { phoneNumber: true },
    });
    const existingPhoneNumbers = new Set(existingCustomers.map((c) => c.phoneNumber));

    // Parse file (CSV or Excel)
    const processFile = () => {
      return new Promise((resolve, reject) => {
        if (req.file.mimetype.includes('spreadsheetml')) {
          // Parse Excel file
          const workbook = new ExcelJS.Workbook();
          workbook.xlsx.readFile(filePath)
            .then(() => {
              const worksheet = workbook.getWorksheet(1);
              const headers = {};
              worksheet.getRow(1).eachCell((cell, colNumber) => {
                headers[cell.text] = colNumber;
              });
              const rows = [];
              worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header row
                const rowData = {};
                Object.keys(headers).forEach((header) => {
                  rowData[header] = row.getCell(headers[header]).text || '';
                });
                rows.push(rowData);
              });
              resolve(rows);
            })
            .catch(reject);
        } else {
          // Parse CSV file
          const rows = [];
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
        }
      });
    };

    const rows = await processFile();

    // Log parsed results for debugging
    console.log('Parsed results:', JSON.stringify(rows, null, 2));

    // Validate headers
    const requiredHeaders = ['phoneNumber', 'unitNumber']; // Updated: removed firstName, lastName, landlordPhoneNumber, buildingName
    const optionalHeaders = ['firstName', 'lastName', 'email', 'closingBalance'];
    const headers = Object.keys(rows[0] || {});
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: `Missing required headers: ${missingHeaders.join(', ')}` });
    }

    const csvPhoneNumbers = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // Account for header row

      // Skip rows without phoneNumber
      if (!row.phoneNumber || !row.phoneNumber.trim()) {
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'SKIPPED_CUSTOMER_ROW',
          resource: 'CUSTOMER_UPLOAD',
          description: `Skipped row ${rowNumber} due to missing phoneNumber`,
          details: { rowNumber, row, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
        console.log(`Row ${rowNumber}: Skipped due to missing phoneNumber`);
        continue;
      }

      const sanitizedPhoneNumber = sanitizePhoneNumber(row.phoneNumber);

      // Skip duplicate phone numbers in the file
      if (csvPhoneNumbers.has(sanitizedPhoneNumber)) {
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'SKIPPED_CUSTOMER_ROW',
          resource: 'CUSTOMER_UPLOAD',
          description: `Skipped row ${rowNumber} due to duplicate phone number in file: ${sanitizedPhoneNumber}`,
          details: { rowNumber, row, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
        console.log(`Row ${rowNumber}: Skipped due to duplicate phone number: ${sanitizedPhoneNumber}`);
        continue;
      }
      csvPhoneNumbers.add(sanitizedPhoneNumber);

      // Skip duplicate phone numbers in the database
      if (existingPhoneNumbers.has(sanitizedPhoneNumber)) {
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'SKIPPED_CUSTOMER_ROW',
          resource: 'CUSTOMER_UPLOAD',
          description: `Skipped row ${rowNumber} due to existing phone number in database: ${sanitizedPhoneNumber}`,
          details: { rowNumber, row, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
        console.log(`Row ${rowNumber}: Skipped due to existing phone number in database: ${sanitizedPhoneNumber}`);
        continue;
      }

      // Handle email validation
      if (row.email && row.email.trim()) {
        const sanitizedEmail = row.email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
          errors.push({ row: rowNumber, reason: `Invalid email format: ${sanitizedEmail}` });
          continue;
        }
        // Note: Duplicate email check could be added if required
      }

      // Handle names: Use available name for both firstName and lastName
      let firstName = row.firstName ? row.firstName.trim() : '';
      let lastName = row.lastName ? row.lastName.trim() : '';
      if (!firstName && !lastName) {
        errors.push({ row: rowNumber, reason: 'At least one of firstName or lastName is required' });
        continue;
      }
      if (!firstName && lastName) {
        firstName = lastName; // Use lastName for both
      } else if (!lastName && firstName) {
        lastName = firstName; // Use firstName for both
      }

      // Validate unit number
      const unitNumber = row.unitNumber?.trim();
      if (!unitNumber) {
        errors.push({ row: rowNumber, reason: 'Missing unit number' });
        continue;
      }

      // Check or create unit
      let unit = await prisma.unit.findFirst({
        where: { tenantId, buildingId, unitNumber },
      });

      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            id: uuidv4(),
            tenantId,
            buildingId,
            unitNumber,
            monthlyCharge: parseFloat(row.monthlyCharge) || 0,
            depositAmount: row.depositAmount ? parseFloat(row.depositAmount) : 0,
            garbageCharge: row.garbageCharge ? parseFloat(row.garbageCharge) : null,
            serviceCharge: row.serviceCharge ? parseFloat(row.serviceCharge) : null,
            securityCharge: row.securityCharge ? parseFloat(row.securityCharge) : null,
            amenitiesCharge: row.amenitiesCharge ? parseFloat(row.amenitiesCharge) : null,
            backupGeneratorCharge: row.backupGeneratorCharge ? parseFloat(row.backupGeneratorCharge) : null,
            status: UnitStatus.OCCUPIED,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'CREATE',
          resource: 'UNIT',
          description: `Unit ${unitNumber} created for building ${buildingId}`,
          details: { unitId: unit.id, unitNumber, buildingId, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
      }

      customersToCreate.push({
        id: uuidv4(),
        tenantId,
        firstName,
        lastName,
        phoneNumber: sanitizedPhoneNumber,
        unitId: unit.id,
        closingBalance: parseFloat(row.closingBalance) || 0,
        status: CustomerStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    if (errors.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'Validation errors', errors });
    }

    if (customersToCreate.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: 'No valid customers to create' });
    }

    // Create customers and audit logs in a transaction
    await prisma.$transaction([
      prisma.customer.createMany({
        data: customersToCreate,
        skipDuplicates: true,
      }),
      ...customersToCreate.map((customer) =>
        prisma.auditLog.create({
          data: {
            id: uuidv4(),
            tenantId,
            userId: parseInt(userId),
            customerId: customer.id,
            action: 'CREATE',
            resource: 'CUSTOMER',
            description: `Customer ${customer.firstName} ${customer.lastName} created`,
            details: {
              customerId: customer.id,
              firstName: customer.firstName,
              lastName: customer.lastName,
              phoneNumber: customer.phoneNumber,
              unitId: customer.unitId,
              timestamp: new Date().toISOString(),
            },
            createdAt: new Date(),
          },
        })
      ),
      ...auditLogs.map((log) => prisma.auditLog.create({ data: log })),
    ]);

    fs.unlinkSync(filePath);
    res.status(201).json({
      success: true,
      message: `Successfully created ${customersToCreate.length} customer(s)`,
      customers: customersToCreate,
    });
  } catch (error) {
    console.error('Error uploading customers:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error uploading customers', error: error.message });
    }
  }
}





const uploadLease = async (req, res) => {
  const { tenantId, user: userId } = req.user;

  try {
    if (!tenantId || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant or User ID missing' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { customerId } = req.body;
    if (!customerId) {
      return res.status(400).json({ message: 'Customer ID is required' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, tenantId: true, firstName: true, lastName: true },
    });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    if (customer.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Unauthorized: Customer does not belong to your tenant' });
    }

    const filePath = path.join('Uploads', 'leases', req.file.filename).replace(/\\/g, '/');
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        leaseFileUrl: filePath,
        updatedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        tenantId: customer.tenantId,
        userId: parseInt(userId),
        customerId: customerId,
        action: 'CREATE',
        resource: 'LEASE',
        description: `Lease agreement uploaded for customer ${customer.firstName} ${customer.lastName}`,
        details: {
          filePath,
          customerId,
        },
        createdAt: new Date(),
      },
    });

    res.status(200).json({ message: 'Lease uploaded successfully' });
  } catch (error) {
    console.error('Error uploading lease:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: error.message || 'Failed to upload lease agreement' });
  }
};




async function uploadLandlord(req, res) {
  const { tenantId, user: userId } = req.user;

  try {
    if (!tenantId || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant or User ID missing' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const results = [];
    const errors = [];
    const auditLogs = [];

    // Parse file (CSV or Excel)
    const processFile = () => {
      return new Promise((resolve, reject) => {
        if (req.file.mimetype.includes('spreadsheetml')) {
          // Parse Excel file
          const workbook = new ExcelJS.Workbook();
          workbook.xlsx.readFile(filePath)
            .then(() => {
              const worksheet = workbook.getWorksheet(1);
              const headers = {};
              worksheet.getRow(1).eachCell((cell, colNumber) => {
                headers[cell.text] = colNumber;
              });
              worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header row
                const rowData = {};
                Object.keys(headers).forEach((header) => {
                  rowData[header] = row.getCell(headers[header]).text || '';
                });
                results.push(rowData);
              });
              resolve();
            })
            .catch(reject);
        } else {
          // Parse CSV file
          fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => results.push(row))
            .on('end', resolve)
            .on('error', reject);
        }
      });
    };

    await processFile();

    // Log parsed results for debugging
    console.log('Parsed results:', JSON.stringify(results, null, 2));

    // Validate headers
    const requiredHeaders = ['phoneNumber'];
    const optionalHeaders = ['firstName', 'lastName', 'email'];
    const headers = Object.keys(results[0] || {});
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: `Missing required headers: ${missingHeaders.join(', ')}` });
    }

    // Validate and prepare landlords
    const landlordsToCreate = [];
    const phoneNumbers = new Set();
    const emails = new Set();

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const rowNumber = i + 2; // Account for header row

      // Skip rows without phoneNumber
      if (!row.phoneNumber || !row.phoneNumber.trim()) {
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'SKIPPED_LANDLORD_ROW',
          resource: 'LANDLORD_UPLOAD',
          description: `Skipped row ${rowNumber} due to missing phoneNumber`,
          details: { rowNumber, row, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
        console.log(`Row ${rowNumber}: Skipped due to missing phoneNumber`);
        continue;
      }

      const sanitizedPhoneNumber = sanitizePhoneNumber(row.phoneNumber);

      // Skip duplicate phone numbers in the file
      if (phoneNumbers.has(sanitizedPhoneNumber)) {
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'SKIPPED_LANDLORD_ROW',
          resource: 'LANDLORD_UPLOAD',
          description: `Skipped row ${rowNumber} due to duplicate phone number in file: ${sanitizedPhoneNumber}`,
          details: { rowNumber, row, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
        console.log(`Row ${rowNumber}: Skipped due to duplicate phone number: ${sanitizedPhoneNumber}`);
        continue;
      }
      phoneNumbers.add(sanitizedPhoneNumber);

      // Handle email validation
      if (row.email && row.email.trim()) {
        const sanitizedEmail = row.email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
          errors.push(`Row ${rowNumber}: Invalid email format: ${sanitizedEmail}`);
          continue;
        }
        if (emails.has(sanitizedEmail)) {
          errors.push(`Row ${rowNumber}: Duplicate email in file: ${sanitizedEmail}`);
          continue;
        }
        emails.add(sanitizedEmail);
      }

      // Handle names: Use available name for both firstName and lastName
      let firstName = row.firstName ? row.firstName.trim() : '';
      let lastName = row.lastName ? row.lastName.trim() : '';
      if (!firstName && !lastName) {
        errors.push(`Row ${rowNumber}: At least one of firstName or lastName is required`);
        continue;
      }
      if (!firstName && lastName) {
        firstName = lastName; // Use lastName for both
      } else if (!lastName && firstName) {
        lastName = firstName; // Use firstName for both
      }

      landlordsToCreate.push({
        id: uuidv4(),
        tenantId,
        firstName,
        lastName,
        phoneNumber: sanitizedPhoneNumber,
        email: row.email ? row.email.trim() : null,
        status: LandlordStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Check for existing phoneNumbers and emails in database
    const existingLandlords = await prisma.landlord.findMany({
      where: {
        OR: [
          { phoneNumber: { in: Array.from(phoneNumbers) } },
          { email: { in: Array.from(emails).filter((e) => e) } },
        ],
      },
      select: { phoneNumber: true, email: true },
    });

    const existingPhoneNumbers = new Set(existingLandlords.map((l) => l.phoneNumber));
    const existingEmails = new Set(existingLandlords.map((l) => l.email).filter((e) => e));

    // Filter out landlords with duplicate phone numbers or emails in the database
    const validLandlordsToCreate = [];
    for (const landlord of landlordsToCreate) {
      const rowNumber = results.findIndex((row) => sanitizePhoneNumber(row.phoneNumber) === landlord.phoneNumber) + 2;
      if (existingPhoneNumbers.has(landlord.phoneNumber)) {
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'SKIPPED_LANDLORD_ROW',
          resource: 'LANDLORD_UPLOAD',
          description: `Skipped row ${rowNumber} due to existing phone number in database: ${landlord.phoneNumber}`,
          details: { rowNumber, landlord, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
        console.log(`Row ${rowNumber}: Skipped due to existing phone number in database: ${landlord.phoneNumber}`);
        continue;
      }
      if (landlord.email && existingEmails.has(landlord.email)) {
        auditLogs.push({
          id: uuidv4(),
          tenantId,
          userId: parseInt(userId),
          action: 'SKIPPED_LANDLORD_ROW',
          resource: 'LANDLORD_UPLOAD',
          description: `Skipped row ${rowNumber} due to existing email in database: ${landlord.email}`,
          details: { rowNumber, landlord, timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });
        console.log(`Row ${rowNumber}: Skipped due to existing email in database: ${landlord.email}`);
        continue;
      }
      validLandlordsToCreate.push(landlord);
    }

    if (errors.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: 'Validation errors', errors });
    }

    if (validLandlordsToCreate.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: 'No valid landlords to create' });
    }

    // Create landlords and audit logs in a transaction
    await prisma.$transaction([
      prisma.landlord.createMany({
        data: validLandlordsToCreate,
      }),
      ...validLandlordsToCreate.map((landlord) =>
        prisma.auditLog.create({
          data: {
            id: uuidv4(),
            tenantId,
            userId: parseInt(userId),
            action: 'CREATE',
            resource: 'LANDLORD',
            description: `Landlord ${landlord.firstName} ${landlord.lastName} created`,
            details: {
              landlordId: landlord.id,
              firstName: landlord.firstName,
              lastName: landlord.lastName,
              phoneNumber: landlord.phoneNumber,
              email: landlord.email,
              timestamp: new Date().toISOString(),
            },
            createdAt: new Date(),
          },
        })
      ),
      ...auditLogs.map((log) => prisma.auditLog.create({ data: log })),
    ]);

    fs.unlinkSync(filePath);
    res.status(201).json({
      message: `Successfully created ${validLandlordsToCreate.length} landlord(s)`,
      landlords: validLandlordsToCreate,
    });
  } catch (error) {
    console.error('Error uploading landlords:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    if (!res.headersSent) {
      res.status(500).json({ message: error.message || 'Failed to upload landlords' });
    }
  }
}


// Helper function to sanitize phone numbers




const downloadLease = async (req, res) => {
  const { tenantId, user: userId } = req.user;
  const { id: customerId } = req.params;

  try {
    if (!tenantId || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Tenant or User ID missing' });
    }

    if (!customerId) {
      return res.status(400).json({ message: 'Customer ID is required' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, tenantId: true, firstName: true, lastName: true, leaseFileUrl: true },
    });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    if (customer.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Unauthorized: Customer does not belong to your tenant' });
    }

    if (!customer.leaseFileUrl) {
      return res.status(404).json({ message: 'No lease agreement found for this customer' });
    }

    const filePath = path.join(__dirname, '..', customer.leaseFileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Lease file not found on server' });
    }

    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        tenantId: customer.tenantId,
        userId: parseInt(userId),
        customerId: customerId,
        action: 'DOWNLOAD',
        resource: 'LEASE',
        description: `Lease agreement downloaded for customer ${customer.firstName} ${customer.lastName}`,
        details: {
          filePath: customer.leaseFileUrl,
          customerId,
        },
        createdAt: new Date(),
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=lease_${customer.firstName}_${customer.lastName}.pdf`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error downloading lease:', error);
    res.status(500).json({ message: error.message || 'Failed to download lease agreement' });
  }
};






// Export the upload middleware and controller functions
module.exports = {
  upload,
  uploadCustomers,
  uploadLease,
  downloadLease,uploadLandlord,uploadCustomersWithBuilding
};