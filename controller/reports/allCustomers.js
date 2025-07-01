const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const prisma = new PrismaClient();
const fs = require('fs');
const { promises: fsPromises } = require('fs');
const path = require('path');
const {  fetchTenant } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');
 // Import header function


 





async function getAllActiveCustomersReport(req, res) {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ message: "Tenant not identified." });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: {
        firstName: true,
        lastName: true,
        phoneNumber: true,
      
        closingBalance: true,
        unit: {
          select: {
            monthlyCharge: true, // Fetch monthlyCharge from Unit
            building: {
              select: {
                name: true, // Fetch building name
              },
            },
          },
        },
      },
    });

    if (!customers.length) {
      return res.status(404).json({ message: "No active customers found." });
    }

    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant details not found." });
    }

    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });

    const filePath = path.join(reportsDir, 'activecustomersreport.pdf');
    console.log('File Path:', filePath);

    // Generate the PDF report with reduced font size
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="activecustomersreport.pdf"');

    doc.pipe(res);

    generatePDFHeader(doc, tenant);

    // Header with reduced font size
    doc.font('Helvetica').fontSize(12).text('Active Customers Report', { align: 'center' });
    doc.moveDown(1);

    // Table Header
    const columnWidths = [100, 120, 100, 120, 100, 100]; // Adjusted for removed column
    const startX = 50;

    function drawTableRow(y, data, isHeader = false) {
      let x = startX;

      // Use reduced font size for headers and content
      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(8); // Header font size
      } else {
        doc.font('Helvetica').fontSize(8); // Content font size
      }

      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Drawing table rows with reduced font size for data
    drawTableRow(
      doc.y,
      ['First Name', 'Last Name', 'Phone', 'Rent', 'Building Name'],
      true
    );
    let rowY = doc.y + 30;

    customers.forEach((customer) => {
      if (rowY > 700) {
        // Avoid page overflow
        doc.addPage();
        rowY = 50;
        drawTableRow(
          rowY,
          ['First Name', 'Last Name', 'Phone', 'Rent', 'Building Name'],
          true
        );
        rowY += 30;
      }

      drawTableRow(rowY, [
        customer.firstName,
        customer.lastName,
        customer.phoneNumber || 'N/A',
      
        customer.unit ? `$${customer.unit.monthlyCharge.toFixed(2)}` : 'N/A', // Use unit.monthlyCharge
        customer.unit?.building?.name || 'N/A', // Use building name
      ]);

      rowY += 30;
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error fetching active customer report:', error);
    res.status(500).json({ error: 'Error generating report' });
  } finally {
    await prisma.$disconnect();
  }
}




 

async function generatePDF(customers, tenant, filePath) {
  const doc = new PDFDocument({ margin: 50 });

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // **Use the reusable header function**
   generatePDFHeader(doc, tenant);

    doc.fontSize(16).font('Helvetica-Bold').text('Weekly Active Customers Report',50,doc.y).
    
    moveDown(2);

    // Group customers by garbage collection day
    const groupedByCollectionDay = customers.reduce((acc, customer) => {
      const day = customer.garbageCollectionDay || 'Unknown';
      if (!acc[day]) {
        acc[day] = { count: 0, customers: [], totalClosingBalance: 0, monthlyTotal: 0 };
      }
      acc[day].count += 1;
      acc[day].customers.push(customer);
      acc[day].totalClosingBalance += customer.closingBalance || 0;
      acc[day].monthlyTotal += customer.monthlyCharge || 0;
      return acc;
    }, {});

    // Add grouped customer data to the PDF
    Object.entries(groupedByCollectionDay).forEach(([day, { count, customers, totalClosingBalance, monthlyTotal }]) => {
      doc.fontSize(14).font('Helvetica-Bold').text(`Collection Day: ${day} (Total Customers: ${count})`).moveDown();

      // Table headers
      doc.font('Helvetica-Bold')
        .text('Name', 50, doc.y, { width: 150, continued: true })
        .text('Phone', 200, doc.y, { width: 100, continued: true })
        .text('Balance', 300, doc.y, { width: 100, continued: true })
        .text('Monthly Charge', 400, doc.y, { width: 100 })
        .moveDown();

      // Draw a horizontal line under headers
      doc.moveTo(50, doc.y - 5).lineTo(550, doc.y - 5).stroke();
      doc.moveDown();

      // Add customer data
      doc.font('Helvetica');
      customers.forEach(customer => {
        doc.text(`${customer.firstName} ${customer.lastName}`, 50, doc.y, { width: 150, continued: true })
          .text(customer.phoneNumber || 'N/A', 200, doc.y, { width: 100, continued: true })
          .text(`KSH ${customer.closingBalance?.toFixed(2) ?? '0.00'}`, 300, doc.y, { width: 100, continued: true })
          .text(`KSH ${customer.monthlyCharge?.toFixed(2) ?? '0.00'}`, 400, doc.y, { width: 100 })
          .moveDown();
      });

      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').text(`Total Closing Balance: KSH ${totalClosingBalance.toFixed(2)}`);
      doc.fontSize(12).font('Helvetica-Bold').text(`Total Monthly Charges: KSH ${monthlyTotal.toFixed(2)}`);
      doc.moveDown(2);
    });

    // **Finalize PDF**
    doc.end();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}





async function getTenantsByLandlordReport(req, res) {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ message: "Tenant not identified." });
  }

  try {
    // Fetch landlords with their buildings, units, and active customers
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
                  where: { status: 'ACTIVE' },
                  select: {
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    closingBalance: true,
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
      return res.status(404).json({ message: "No active landlords found." });
    }

    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant details not found." });
    }

    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });

    const filePath = path.join(reportsDir, 'tenantsbylandlordreport.pdf');
    console.log('File Path:', filePath);

    // Generate the PDF report
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="tenantsbylandlordreport.pdf"');

    doc.pipe(res);

    generatePDFHeader(doc, tenant);

    // Report title
    doc.font('Helvetica').fontSize(12).text('Tenants by Landlord Report', { align: 'center' });
    doc.moveDown(1);

    // Table setup
    const columnWidths = [80, 100, 80, 90,100, 100, 150]; // For First Name, Last Name, Phone, Email, Monthly Charge, Building Name
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

      // Collect all tenants for this landlord
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
        doc.font('Helvetica').fontSize(8).text('No active tenants for this landlord.', { align: 'left' });
        doc.moveDown(1);
        continue;
      }

      // Draw table header
      drawTableRow(
        doc.y,
        ['First Name', 'Last Name', 'Phone', 'Rent','Balance', 'Building Name'],
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
            ['First Name', 'Last Name', 'Phone', 'Rent','Balance', 'Building Name'],
            true
          );
          rowY = doc.y + 30;
        }

        drawTableRow(rowY, [
          tenant.firstName,
          tenant.lastName,
          tenant.phoneNumber || 'N/A',
        
          tenant.monthlyCharge ? `$${tenant.monthlyCharge.toFixed(2)}` : 'N/A',
          tenant.closingBalance ? `KSH ${tenant.closingBalance.toFixed(2)}` : 'N/A',
          tenant.buildingName || 'N/A',
        ]);

        rowY += 30;
      });

      doc.moveDown(1);
    }

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating tenants by landlord report:', error);
    res.status(500).json({ error: 'Error generating report' });
  } finally {
    await prisma.$disconnect();
  }
}
















module.exports = { getAllActiveCustomersReport ,getTenantsByLandlordReport, generatePDF };
