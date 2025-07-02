const { PrismaClient,CustomerStatus  } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const path = require('path'); // Ensure path is imported
const { generatePDFHeader } = require('../header');
const fsPromises = require('fs').promises;
const prisma = new PrismaClient();
const { fetchTenant } = require('../../tenants/tenantupdate.js');

















// Helper to draw table row
function drawTableRow(doc, y, data, columnWidths, startX = 50, isHeader = false, isBold = false) {
  let x = startX;
  doc.font(isBold || isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
  data.forEach((text, index) => {
    doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
    doc.rect(x, y, columnWidths[index], 25).stroke();
    x += columnWidths[index];
  });
}




async function getIncomePerBuilding(req, res) {
  const tenantId = req.user?.tenantId;
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  if (!tenantId) {
    return res.status(401).json({ message: 'Tenant not identified.' });
  }

  try {
    console.log(`Generating income per building report for tenantId: ${tenantId}, month: ${month}`);
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }
    const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Fetch payments linked to RENT_PLUS invoices
    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate }, // Re-enabled date filter
        customer: { status: 'ACTIVE' }, // Filter for active customers
        Invoice: {
          some: {
            invoiceType: 'RENT_PLUS', // Only include payments linked to RENT_PLUS invoices
          },
        },
      },
      select: {
        id: true,
        amount: true,
        createdAt: true, // For debugging
        customer: {
          select: {
            id: true,
            unit: {
              select: {
                id: true,
                building: {
                  select: {
                    id: true,
                    name: true,
                    managementRate: true,
                    landlord: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    console.log(`Total payments found (RENT_PLUS only): ${payments.length}`);
    payments.forEach((p) => {
      console.log(
        `Payment ${p.id}: Amount=${p.amount}, CreatedAt=${p.createdAt.toISOString()}, CustomerId=${p.customer?.id || 'null'}, UnitId=${p.customer?.unit?.id || 'null'}, BuildingId=${p.customer?.unit?.building?.id || 'null'}`
      );
    });

    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant details not found.' });
    }

    // Initialize building data
    const buildingData = new Map();
    const landlordBuildings = new Map();

    payments.forEach((payment) => {
      const customer = payment.customer;
      if (!customer?.unit?.building) {
        console.log(`Payment ${payment.id} skipped: No valid unit or building`);
        return;
      }

      const building = customer.unit.building;
      const landlordName = `${building.landlord.firstName} ${building.landlord.lastName}`.trim();
      const buildingId = building.id;

      if (!buildingData.has(buildingId)) {
        buildingData.set(buildingId, {
          landlordName,
          name: building.name,
          totalIncome: 0,
          managementFees: 0,
          managementRate: (building.managementRate || 0) / 100,
        });
      }

      const buildingEntry = buildingData.get(buildingId);
      buildingEntry.totalIncome += payment.amount;
      buildingEntry.managementFees += payment.amount * buildingEntry.managementRate;

      // Group by landlord
      if (!landlordBuildings.has(landlordName)) {
        landlordBuildings.set(landlordName, new Map());
      }
      landlordBuildings.get(landlordName).set(buildingId, buildingEntry);
    });

    console.log(`Buildings with income: ${buildingData.size}`);
    console.log(`Landlords with buildings: ${landlordBuildings.size}`);

    // Generate PDF
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });
    const filePath = path.join(reportsDir, `income-per-building_${month}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="income-per-building_${month}.pdf"`);
    doc.pipe(res);

    generatePDFHeader(doc, tenant);
    doc.font('Helvetica').fontSize(12).text(`Income per Building Report (Rent & Other Charges) - ${month}`, { align: 'center' });
    doc.moveDown(1);

    const columnWidths = [150, 150, 100, 100, 100];
    const startX = 50;

    drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
    let rowY = doc.y + 30;

    // Check if report is empty
    if (landlordBuildings.size === 0) {
      doc.font('Helvetica').fontSize(10).text('No income recorded for this period (excluding water bills).', startX, rowY, { align: 'center' });
      doc.end();
      return;
    }

    let grandTotalIncome = 0;
    let grandTotalManagementFees = 0;

    // Generate report by landlord
    for (const [landlordName, buildings] of landlordBuildings) {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
        drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
        rowY = doc.y + 30;
      }
      drawTableRow(doc, rowY, [landlordName, '', '', '', ''], columnWidths, startX, false, true);
      rowY += 30;

      for (const buildingEntry of buildings.values()) {
        const netAmount = buildingEntry.totalIncome - buildingEntry.managementFees;

        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
          rowY = doc.y + 30;
        }

        drawTableRow(doc, rowY, [
          '',
          buildingEntry.name,
          buildingEntry.totalIncome > 0 ? `Ksh${buildingEntry.totalIncome.toFixed(2)}` : 'No rent collected',
          buildingEntry.totalIncome > 0 ? `Ksh${buildingEntry.managementFees.toFixed(2)}` : 'Ksh0.00',
          buildingEntry.totalIncome > 0 ? `Ksh${netAmount.toFixed(2)}` : 'Ksh0.00',
        ], columnWidths, startX);
        rowY += 30;

        grandTotalIncome += buildingEntry.totalIncome;
        grandTotalManagementFees += buildingEntry.managementFees;
      }
    }

    // Grand total
    if (rowY > 700) {
      doc.addPage();
      rowY = 50;
      drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
      rowY = doc.y + 30;
    }

    const grandTotalNet = grandTotalIncome - grandTotalManagementFees;
    drawTableRow(doc, rowY, [
      '',
      'Grand Total',
      grandTotalIncome > 0 ? `Ksh${grandTotalIncome.toFixed(2)}` : 'No rent collected',
      grandTotalIncome > 0 ? `Ksh${grandTotalManagementFees.toFixed(2)}` : 'Ksh0.00',
      grandTotalIncome > 0 ? `Ksh${grandTotalNet.toFixed(2)}` : 'Ksh0.00',
    ], columnWidths, startX, false, true);

    doc.end();
  } catch (error) {
    console.error('Error generating income per building report:', error);
    return res.status(500).json({ error: 'Error generating report', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
}










// Income per Landlord Report
async function getIncomePerLandlord(req, res) {
  const tenantId = req.user?.tenantId;
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  if (!tenantId) {
    return res.status(401).json({ message: 'Tenant not identified.' });
  }

  try {
    console.log(`Generating income per landlord report for tenantId: ${tenantId}, month: ${month}`);
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }
    // Set date range for the entire month (e.g., 2025-06-01 00:00:00 to 2025-06-30 23:59:59.999)
    const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Fetch payments linked to RENT_PLUS invoices
    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate }, // Uncommented to filter by date
        customerId: { not: null }, // Only include payments with a valid customerId
        customer: { status: 'ACTIVE' }, // Filter for active customers
        Invoice: {
          some: {
            invoiceType: 'RENT_PLUS', // Only include payments linked to RENT_PLUS invoices
          },
        },
      },
      select: {
        id: true,
        amount: true,
        createdAt: true, // For debugging
        customer: {
          select: {
            id: true,
            unit: {
              select: {
                id: true,
                building: {
                  select: {
                    id: true,
                    name: true,
                    managementRate: true,
                    landlord: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      take: 1000, // Limit to prevent timeout
    });

    console.log(`Total payments found (RENT_PLUS only): ${payments.length}`);
    payments.forEach((p) => {
      console.log(
        `Payment ${p.id}: Amount=${p.amount}, CreatedAt=${p.createdAt.toISOString()}, CustomerId=${p.customer?.id || 'null'}, UnitId=${p.customer?.unit?.id || 'null'}, BuildingId=${p.customer?.unit?.building?.id || 'null'}`
      );
    });

    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant details not found.' });
    }

    // Initialize landlord data
    const landlordData = new Map();

    for (const payment of payments) {
      const customer = payment.customer;
      if (!customer?.unit?.building) {
        console.log(`Payment ${payment.id} skipped: No valid unit or building`);
        continue;
      }

      const building = customer.unit.building;
      const landlordId = building.landlord.id;
      const landlordName = `${building.landlord.firstName} ${building.landlord.lastName}`.trim();

      if (!landlordData.has(landlordId)) {
        landlordData.set(landlordId, {
          landlordName,
          buildings: new Map(),
          totalIncome: 0,
          totalManagementFees: 0,
          totalUnits: 0,
        });
      }

      const landlordEntry = landlordData.get(landlordId);
      const buildingId = building.id;

      if (!landlordEntry.buildings.has(buildingId)) {
        // Fetch unit count for the building
        const unitCount = await prisma.unit.count({
          where: { buildingId, tenantId },
        });

        landlordEntry.buildings.set(buildingId, {
          name: building.name,
          totalIncome: 0,
          managementFees: 0,
          managementRate: (building.managementRate || 0) / 100,
          unitCount,
        });
        landlordEntry.totalUnits += unitCount;
      }

      const buildingEntry = landlordEntry.buildings.get(buildingId);
      buildingEntry.totalIncome += payment.amount;
      buildingEntry.managementFees += payment.amount * buildingEntry.managementRate;
      landlordEntry.totalIncome += payment.amount;
      landlordEntry.totalManagementFees += payment.amount * buildingEntry.managementRate;
    }

    console.log(`Landlords with income: ${landlordData.size}`);

    // Generate PDF
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });
    const filePath = path.join(reportsDir, `income-per-landlord_${month}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="income-per-landlord_${month}.pdf"`);
    doc.pipe(res);

    generatePDFHeader(doc, tenant);
    doc.font('Helvetica').fontSize(12).text(`Income per Landlord Report (Rent & Other Charges) - ${month}`, { align: 'center' });
    doc.moveDown(1);

    const columnWidths = [100, 100, 50, 80, 80, 80];
    const startX = 50;

    drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Units', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
    let rowY = doc.y + 30;

    // Check if report is empty
    if (landlordData.size === 0) {
      doc.font('Helvetica').fontSize(10).text('No income recorded for this period (excluding water bills).', startX, rowY, { align: 'center' });
      doc.end();
      return;
    }

    let grandTotalIncome = 0;
    let grandTotalManagementFees = 0;
    let grandTotalUnits = 0;

    // Generate report by landlord
    for (const [landlordId, landlordEntry] of landlordData) {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
        drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Units', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
        rowY = doc.y + 30;
      }
      const landlordNet = landlordEntry.totalIncome - landlordEntry.totalManagementFees;
      drawTableRow(doc, rowY, [
        landlordEntry.landlordName,
        '',
        landlordEntry.totalUnits.toString(),
        `Ksh${landlordEntry.totalIncome.toFixed(2)}`,
        `Ksh${landlordEntry.totalManagementFees.toFixed(2)}`,
        `Ksh${landlordNet.toFixed(2)}`,
      ], columnWidths, startX, false, true);
      rowY += 30;

      for (const buildingEntry of landlordEntry.buildings.values()) {
        const netAmount = buildingEntry.totalIncome - buildingEntry.managementFees;

        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Units', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
          rowY = doc.y + 30;
        }

        drawTableRow(doc, rowY, [
          '',
          buildingEntry.name,
          buildingEntry.unitCount.toString(),
          buildingEntry.totalIncome > 0 ? `Ksh${buildingEntry.totalIncome.toFixed(2)}` : 'No rent collected',
          buildingEntry.totalIncome > 0 ? `Ksh${buildingEntry.managementFees.toFixed(2)}` : 'Ksh 0.00',
          buildingEntry.totalIncome > 0 ? `Ksh${netAmount.toFixed(2)}` : 'Ksh 0.00',
        ], columnWidths, startX);
        rowY += 30;
      }

      grandTotalIncome += landlordEntry.totalIncome;
      grandGrandTotalManagementFees += landlordEntry.totalManagementFees;
      grandTotalUnits += landlordEntry.totalUnits;
    }

    // Grand total
    if (rowY > 700) {
      doc.addPage();
      rowY = 50;
      drawTableRow(doc, doc.y, ['Landlord Name', 'Building Name', 'Units', 'Total Income', 'Management Fees', 'Net Amount Paid'], columnWidths, startX, true);
      rowY = doc.y + 30;
    }

    const grandTotalNet = grandTotalIncome - grandTotalManagementFees;
    drawTableRow(doc, rowY, [
      '',
      'Grand Total',
      grandTotalUnits.toString(),
      grandTotalIncome > 0 ? `Ksh${grandTotalIncome.toFixed(2)}` : 'No rent collected',
      grandTotalIncome > 0 ? `Ksh${grandTotalManagementFees.toFixed(2)}` : 'Ksh0.00',
      grandTotalIncome > 0 ? `Ksh${grandTotalNet.toFixed(2)}` : 'Ksh 0.00',
    ], columnWidths, startX, false, true);

    doc.end();
  } catch (error) {
    console.error('Error generating income per landlord report:', error);
    return res.status(500).json({ error: 'Error generating report', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
}


async function getLandlordRentReport(req, res) {
  const tenantId = req.user?.tenantId;
  const month = req.query.month || new Date().toISOString().slice(0, 7); // Default to current month

  if (!tenantId) {
    return res.status(401).json({ message: 'Tenant not identified.' });
  }

  try {
    console.log(`Generating landlord rent report for tenantId: ${tenantId}, month: ${month}`);

    // Parse month for date range (e.g., 2025-06 -> 2025-06-01 to 2025-06-30)
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }
    const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999); // Last day of the month

    // Fetch landlords with buildings, units, customers, and RENT_PLUS invoice payments
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
            managementRate: true,
            units: {
              select: {
                id: true,
                customers: {
                  where: { status: 'ACTIVE' },
                  select: {
                    id: true,
                    phoneNumber: true,
                    invoices: {
                      where: { invoiceType: 'RENT_PLUS' }, // Filter for RENT_PLUS invoices
                      select: {
                        payments: {
                          where: {
                            createdAt: {
                              gte: startDate,
                              lte: endDate,
                            },
                          },
                          select: {
                            id: true,
                            amount: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Fetch all payments for the tenant in the specified month linked to RENT_PLUS invoices
    const allPayments = await prisma.payment.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        Invoice: {
          some: {
            invoiceType: 'RENT_PLUS', // Only include payments linked to RENT_PLUS invoices
          },
        },
      },
      select: {
        id: true,
        amount: true,
        phoneNumber: true, // Added for fallback matching
        customer: {
          select: {
            id: true,
            unit: {
              select: {
                building: {
                  select: {
                    id: true,
                    landlordId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Log payment counts for debugging
    console.log(`Total RENT_PLUS payments for tenantId ${tenantId} in ${month}: ${allPayments.length}`);
    landlords.forEach((landlord) => {
      const linkedPaymentCount = landlord.buildings
        .flatMap((b) => b.units.flatMap((u) => u.customers.flatMap((c) => c.invoices.flatMap((i) => i.payments))))
        .length;
      console.log(`Landlord ${landlord.firstName} ${landlord.lastName} has ${linkedPaymentCount} linked RENT_PLUS payments`);
    });

    // Fetch tenant details
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

    const filePath = path.join(reportsDir, `landlordrentreport_${month}.pdf`);
    console.log('File Path:', filePath);

    // Generate the PDF report
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="landlordrentreport_${month}.pdf"`);

    doc.pipe(res);

    generatePDFHeader(doc, tenant);

    // Report title with month
    doc.font('Helvetica').fontSize(12).text(`Landlord Rent Report (Rent & Other Charges) - ${month}`, { align: 'center' });
    doc.moveDown(1);

    // Table setup
    const columnWidths = [60, 90, 100, 100, 100]; // Adjusted for consistency
    const startX = 50;

    function drawTableRow(y, data, isHeader = false, isBold = false) {
      let x = startX;
      doc.font(isBold || isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Draw table header
    drawTableRow(
      doc.y,
      ['Landlord Name', 'Property', 'Total Income', 'Management Fees', 'Net Amount Paid'],
      true
    );
    let rowY = doc.y + 30;

    // Process payments by landlord and building
    const landlordData = new Map();
    let grandTotalIncome = 0;
    let grandTotalManagementFees = 0;

    landlords.forEach((landlord) => {
      landlordData.set(landlord.id, {
        name: `${landlord.firstName} ${landlord.lastName}`.trim(),
        buildings: new Map(
          landlord.buildings.map((b) => [
            b.id,
            { name: b.name, totalIncome: 0, managementFees: 0, managementRate: (b.managementRate || 0) / 100 },
          ])
        ),
        totalIncome: 0,
        totalManagementFees: 0,
      });
    });

    // Process linked payments (through invoices)
    landlords.forEach((landlord) => {
      const landlordEntry = landlordData.get(landlord.id);
      landlord.buildings.forEach((building) => {
        const buildingEntry = landlordEntry.buildings.get(building.id);
        const buildingRent = building.units
          .flatMap((unit) => unit.customers)
          .flatMap((customer) => customer.invoices)
          .flatMap((invoice) => invoice.payments)
          .reduce((sum, payment) => sum + payment.amount, 0);
        const buildingFees = buildingRent * buildingEntry.managementRate;

        buildingEntry.totalIncome += buildingRent;
        buildingEntry.managementFees += buildingFees;
        landlordEntry.totalIncome += buildingRent;
        landlordEntry.totalManagementFees += buildingFees;
      });
    });

    // Process unlinked payments (using Customer relationship or phoneNumber)
    for (const payment of allPayments) {
      let landlordId = null;
      let buildingId = null;

      // Try to match via Customer relationship
      if (payment.customer && payment.customer.unit && payment.customer.unit.building) {
        landlordId = payment.customer.unit.building.landlordId;
        buildingId = payment.customer.unit.building.id;
      } else if (payment.phoneNumber) {
        // Fallback: Match by phoneNumber
        const customer = await prisma.customer.findFirst({
          where: {
            phoneNumber: payment.phoneNumber,
            status: 'ACTIVE',
            unit: { building: { landlord: { tenantId } } },
          },
          select: {
            unit: {
              select: {
                building: {
                  select: { id: true, landlordId: true },
                },
              },
            },
          },
        });
        if (customer?.unit?.building) {
          landlordId = customer.unit.building.landlordId;
          buildingId = customer.unit.building.id;
        }
      }

      if (landlordId && buildingId && landlordData.has(landlordId)) {
        const landlordEntry = landlordData.get(landlordId);
        const buildingEntry = landlordEntry.buildings.get(buildingId);
        if (buildingEntry) {
          buildingEntry.totalIncome += payment.amount;
          buildingEntry.managementFees += payment.amount * buildingEntry.managementRate;
          landlordEntry.totalIncome += payment.amount;
          landlordEntry.totalManagementFees += payment.amount * buildingEntry.managementRate;
        }
      }
    }

    // Update grand totals
    landlordData.forEach((landlordEntry) => {
      grandTotalIncome += landlordEntry.totalIncome;
      grandTotalManagementFees += landlordEntry.totalManagementFees;
    });

    // Generate report rows
    for (const landlord of landlords) {
      const landlordEntry = landlordData.get(landlord.id);
      let hasBuildingsWithIncome = false;

      // Check if any buildings have income
      for (const building of landlordEntry.buildings.values()) {
        if (building.totalIncome > 0) {
          hasBuildingsWithIncome = true;
          break;
        }
      }

      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
        drawTableRow(
          doc.y,
          ['Landlord Name', 'Property', 'Total Income', 'Management Fees', 'Net Amount Paid'],
          true
        );
        rowY = doc.y + 30;
      }

      if (!hasBuildingsWithIncome) {
        // No income for any buildings
        drawTableRow(rowY, [
          landlordEntry.name,
          'No properties with income',
          'No rent collected',
          'Ksh0.00',
          'Ksh0.00',
        ]);
        rowY += 30;
      } else {
        // List each building
        let isFirstBuilding = true;
        for (const building of landlordEntry.buildings.values()) {
          const netAmount = building.totalIncome - building.managementFees;

          if (rowY > 700) {
            doc.addPage();
            rowY = 50;
            drawTableRow(
              doc.y,
              ['Landlord Name', 'Property', 'Total Income', 'Management Fees', 'Net Amount Paid'],
              true
            );
            rowY = doc.y + 30;
          }

          drawTableRow(rowY, [
            isFirstBuilding ? landlordEntry.name : '', // Only show landlord name for first building
            building.name,
            building.totalIncome > 0 ? `Ksh${building.totalIncome.toFixed(2)}` : 'No rent collected',
            building.totalIncome > 0 ? `Ksh${building.managementFees.toFixed(2)}` : 'Ksh0.00',
            building.totalIncome > 0 ? `Ksh${netAmount.toFixed(2)}` : 'Ksh0.00',
          ]);
          rowY += 30;
          isFirstBuilding = false;
        }

        // Add landlord total row in bold
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          drawTableRow(
            doc.y,
            ['Landlord Name', 'Property', 'Total Income', 'Management Fees', 'Net Amount Paid'],
            true
          );
          rowY = doc.y + 30;
        }

        const landlordNetAmount = landlordEntry.totalIncome - landlordEntry.totalManagementFees;
        drawTableRow(
          rowY,
          [
            '',
            `Total for ${landlordEntry.name}`,
            landlordEntry.totalIncome > 0 ? `Ksh${landlordEntry.totalIncome.toFixed(2)}` : 'No rent collected',
            landlordEntry.totalIncome > 0 ? `Ksh${landlordEntry.totalManagementFees.toFixed(2)}` : 'Ksh0.00',
            landlordEntry.totalIncome > 0 ? `Ksh${landlordNetAmount.toFixed(2)}` : 'Ksh0.00',
          ],
          false,
          true // Bold
        );
        rowY += 30;
      }
    }

    // Add grand total row in bold
    if (rowY > 700) {
      doc.addPage();
      rowY = 50;
      drawTableRow(
        doc.y,
        ['Landlord Name', 'Property', 'Total Income', 'Management Fees', 'Net Amount Paid'],
        true
      );
      rowY = doc.y + 30;
    }

    const grandTotalNet = grandTotalIncome - grandTotalManagementFees;
    drawTableRow(
      rowY,
      [
        '',
        'Grand Total',
        grandTotalIncome > 0 ? `Ksh${grandTotalIncome.toFixed(2)}` : 'No rent collected',
        grandTotalIncome > 0 ? `Ksh${grandTotalManagementFees.toFixed(2)}` : 'Ksh0.00',
        grandTotalIncome > 0 ? `Ksh${grandTotalNet.toFixed(2)}` : 'Ksh0.00',
      ],
      false,
      true // Bold
    );

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating landlord rent report:', error);
    return res.status(500).json({ error: 'Error generating report', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
}




// Placeholder for generatePDFHeader (customize as needed)


module.exports = { getLandlordRentReport, getIncomePerBuilding,getIncomePerLandlord };