const { fetchTenantDetails, fetchTenant } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');
const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const path = require('path');
const prisma = new PrismaClient();
const { promises: fsPromises } = require('fs');




async function getDormantCustomersReport(req, res) {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ message: 'Tenant not identified.' });
  }

  try {
    // Log to verify tenantId
    console.log(`Generating dormant customers report for tenantId: ${tenantId}`);

    // Fetch landlords with minimal required fields to reduce query load
    const landlords = await prisma.landlord.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        buildings: {
          select: {
            id: true,
            name: true,
            units: {
              select: {
                id: true,
                monthlyCharge: true,
                customers: {
                  where: { status: 'INACTIVE' },
                  select: {
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!landlords.length) {
      return res.status(404).json({ message: 'No active landlords found.' });
    }

    // Fetch tenant details (assumed to be lightweight)
    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant details not found.' });
    }

    // Construct and log the file path
    const reportsDir = path.join(__dirname, '..', 'reports');
    console.log('Reports directory:', reportsDir);

    try {
      await fsPromises.mkdir(reportsDir, { recursive: true });
      console.log('Reports directory created or already exists');
    } catch (err) {
      console.error('Error creating reports directory:', err);
      return res.status(500).json({ error: 'Failed to create reports directory' });
    }

    const filePath = path.join(reportsDir, 'dormantcustomersreport.pdf');
    console.log('File Path:', filePath);

    // Generate the PDF report
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="dormantcustomersreport.pdf"');

    doc.pipe(res);

    generatePDFHeader(doc, tenant);

    // Report title
    doc.font('Helvetica').fontSize(12).text('Dormant Customers Report', { align: 'center' });
    doc.moveDown(1);

    // Table setup
    const columnWidths = [100, 120, 100, 120, 100, 100]; // For First Name, Last Name, Phone, Email, Monthly Charge, Building Name
    const startX = 50;

    function drawTableRow(y, data, isHeader = false) {
      let x = startX;
      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(8);
      } else {
        doc.font('Helvetica').fontSize(8);
      }
      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Iterate through landlords
    for (const landlord of landlords) {
      const landlordName = `${landlord.firstName} ${landlord.lastName}`.trim();
      doc.font('Helvetica-Bold').fontSize(10).text(`Landlord: ${landlordName}`, { align: 'left' });
      doc.moveDown(0.5);

      // Collect dormant tenants
      const tenants = landlord.buildings
        .flatMap((building) =>
          building.units.flatMap((unit) =>
            unit.customers.map((customer) => ({
              ...customer,
              monthlyCharge: unit.monthlyCharge,
              buildingName: building.name,
            }))
          )
        );

      if (!tenants.length) {
        doc.font('Helvetica').fontSize(8).text('No dormant tenants for this landlord.', { align: 'left' });
        doc.moveDown(1);
        continue;
      }

      // Draw table header
      drawTableRow(
        doc.y,
        ['First Name', 'Last Name', 'Phone', 'Rent', 'Building Name'],
        true
      );
      let rowY = doc.y + 30;

      // Draw tenant rows
      tenants.forEach((tenant) => {
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          doc.font('Helvetica-Bold').fontSize(10).text(`Landlord: ${landlordName}`, { align: 'left' });
          doc.moveDown(0.5);
          drawTableRow(
            doc.y,
            ['First Name', 'Last Name', 'Phone', 'Monthly Charge', 'Building Name'],
            true
          );
          rowY = doc.y + 30;
        }

        drawTableRow(rowY, [
          tenant.firstName,
          tenant.lastName,
          tenant.phoneNumber || 'N/A',
       
          tenant.monthlyCharge ? `$${tenant.monthlyCharge.toFixed(2)}` : 'N/A',
          tenant.buildingName || 'N/A',
        ]);

        rowY += 30;
      });

      doc.moveDown(1);
    }

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating dormant customers report:', error);
    return res.status(500).json({ error: 'Error generating report', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
}








module.exports = { getDormantCustomersReport };




