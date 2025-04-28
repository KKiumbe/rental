const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { PrismaClient, CustomerStatus, LandlordStatus, UnitStatus } = require('@prisma/client');
const prisma = new PrismaClient();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

const sanitizePhoneNumber = (phone) => {
  if (typeof phone !== 'string') return '';
  if (phone.startsWith('+254')) return '0' + phone.slice(4);
  if (phone.startsWith('254')) return '0' + phone.slice(3);
  return phone;
};





const uploadCustomers = async (req, res) => {
  const {tenantId,user:userId} = req.user;


  if (!tenantId || !userId) {
    return res.status(400).json({ success: false, message: 'Tenant or User ID missing.' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const customersToCreate = [];
  const errors = [];

  try {
    const processCSV = () => {
      return new Promise((resolve, reject) => {
        const rows = [];

        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', async () => {
            for (const row of rows) {
              try {
                const sanitizedPhoneNumber = sanitizePhoneNumber(row.phoneNumber);
                const landlordPhoneNumber = sanitizePhoneNumber(row.landlordPhoneNumber);

                // 1. Find or create landlord
                let landlord = await prisma.landlord.findFirst({
                  where: { tenantId, phoneNumber: landlordPhoneNumber }
                });

                if (!landlord) {
                  landlord = await prisma.landlord.create({
                    data: {
                      tenantId,
                      firstName: row.landlordFirstName?.trim() || 'Unknown',
                      lastName: row.landlordLastName?.trim() || 'Unknown',
                      phoneNumber: landlordPhoneNumber,
                      status: LandlordStatus.ACTIVE,
                     
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    }
                  });
                }

                // 2. Find or create building
                const buildingName = row.buildingName?.trim();
                if (!buildingName) {
                  errors.push({ row, reason: 'Missing building name' });
                  continue;
                }

                let building = await prisma.building.findFirst({
                  where: { tenantId, landlordId: landlord.id, name: buildingName }
                });

                if (!building) {
                  building = await prisma.building.create({
                    data: {
                      tenantId,
                      landlordId: landlord.id,
                      name: buildingName,
                      billGarbage: row.billGarbage?.toLowerCase() === 'true',
                      billService: row.billService?.toLowerCase() === 'true',
                      billSecurity: row.billSecurity?.toLowerCase() === 'true',
                      billAmenities: row.billAmenities?.toLowerCase() === 'true',
                      billBackupGenerator: row.billBackupGenerator?.toLowerCase() === 'true',
                      billWater: row.billWater?.toLowerCase() === 'true',
                      waterRate: row.waterRate ? parseFloat(row.waterRate) : null,
                      location: row.buildingLocation || '',
                    
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    }
                  });
                }

                // 3. Find or create unit
                const unitNumber = row.unitNumber?.trim();
                if (!unitNumber) {
                  errors.push({ row, reason: 'Missing unit number' });
                  continue;
                }

                let unit = await prisma.unit.findFirst({
                  where: { tenantId, buildingId: building.id, unitNumber }
                });

                if (!unit) {
                  unit = await prisma.unit.create({
                    data: {
                      tenantId,
                      buildingId: building.id,
                      landlordId: landlord.id,
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
                    }
                  });
                }

                // 4. Create customer
                customersToCreate.push({
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
                console.error('Row error:', err);
                errors.push({ row, reason: err.message });
              }
            }
            resolve();
          })
          .on('error', (error) => {
            reject(error);
          });
      });
    };

    await processCSV();

    if (customersToCreate.length > 0) {
      await prisma.customer.createMany({ data: customersToCreate });
    }

    fs.unlinkSync(filePath);

    res.status(200).json({
      success: true,
      message: `${customersToCreate.length} customers created successfully.`,
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






// New controller function to update customer details (estateName, building, houseNumber, category)
const updateCustomersDetails = async (req, res) => {
  const { tenantId } = req.user;

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required for updating customer details.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const filePath = path.join(uploadsDir, req.file.filename);
  const updates = [];
  const requiredField = ['phoneNumber']; // Only phoneNumber is mandatory
  const allowedFields = ['phoneNumber', 'estateName', 'building', 'houseNumber', 'category'];

  try {
    const tenantExists = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenantExists) {
      fs.unlinkSync(filePath);
      return res.status(404).json({ message: 'Invalid tenant ID. Tenant does not exist.' });
    }

    let headersValidated = false;
    let headers = [];

    const stream = fs.createReadStream(filePath).pipe(csv());

    stream
      .on('headers', (headerList) => {
        headers = headerList.map((header) => header.trim());
        const missingFields = requiredField.filter((field) => !headers.includes(field));
        if (missingFields.length > 0) {
          stream.destroy();
          fs.unlinkSync(filePath);
          return res.status(400).json({
            message: `CSV file is missing required field: ${missingFields.join(', ')}. Required field is: phoneNumber`,
          });
        }

        // Check for invalid fields
        const extraFields = headers.filter((header) => !allowedFields.includes(header));
        if (extraFields.length > 0) {
          stream.destroy();
          fs.unlinkSync(filePath);
          return res.status(400).json({
            message: `CSV file contains invalid fields: ${extraFields.join(', ')}. Allowed fields are: ${allowedFields.join(', ')}`,
          });
        }

        headersValidated = true;
      })
      .on('data', (data) => {
        if (!headersValidated) return;

        const phoneNumber = data.phoneNumber?.trim();
        if (!phoneNumber) {
          console.warn(`Invalid data: Missing phoneNumber in row: ${JSON.stringify(data)}`);
          return;
        }

        // Build update object with only provided fields
        const updateData = { phoneNumber };
        if (data.estateName?.trim()) updateData.estateName = data.estateName.trim();
        if (data.building?.trim()) updateData.building = data.building.trim();
        if (data.houseNumber?.trim()) updateData.houseNumber = data.houseNumber.trim();
        if (data.category?.trim()) updateData.category = data.category.trim();

        updates.push(updateData);
      })
      .on('end', async () => {
        if (!headersValidated) return;
        if (updates.length === 0) {
          fs.unlinkSync(filePath);
          return res.status(400).json({ message: 'No valid data found in the CSV file' });
        }

        try {
          const updatePromises = updates.map((update) => {
            const dataToUpdate = {};
            if (update.estateName) dataToUpdate.estateName = update.estateName;
            if (update.building) dataToUpdate.building = update.building;
            if (update.houseNumber) dataToUpdate.houseNumber = update.houseNumber;
            if (update.category) dataToUpdate.category = update.category;

            return prisma.customer.updateMany({
              where: { phoneNumber: update.phoneNumber, tenantId },
              data: dataToUpdate,
            });
          });

          const results = await Promise.all(updatePromises);
          const updatedCount = results.reduce((sum, result) => sum + result.count, 0);

          if (updatedCount === 0) {
            res.status(404).json({ message: 'No customers found to update with the provided phone numbers' });
          } else {
            res.status(200).json({
              message: `Successfully updated ${updatedCount} customer(s)`,
              updatedCount,
              updates,
            });
          }
        } catch (error) {
          console.error('Error updating customer details:', error);
          res.status(500).json({ message: 'Error updating customer details' });
        } finally {
          fs.unlinkSync(filePath);
        }
      })
      .on('error', (error) => {
        console.error('Error reading CSV file:', error);
        fs.unlinkSync(filePath);
        res.status(500).json({ message: 'Error processing CSV file' });
      });
  } catch (error) {
    console.error('Error in updateCustomersDetails:', error);
    fs.unlinkSync(filePath);
    res.status(500).json({ message: 'Server error during update process' });
  }
};

// Export the upload middleware and controller functions
module.exports = {
  upload,
  uploadCustomers,
  updateCustomersDetails,
};