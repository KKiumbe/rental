const path = require('path');

const { PrismaClient,InvoiceStatus,InvoiceType  } = require('@prisma/client');

const prisma = new PrismaClient();
const fsPromises = require('fs').promises;
const PDFDocument = require('pdfkit');

const { fetchTenant } = require('../../tenants/tenantupdate.js');
const { generatePDFHeader } = require('../header.js');



function drawTableRow(doc, y, data, columnWidths, startX, isHeader = false, isBold = false) {
  let x = startX;
  doc.font(isBold || isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
  data.forEach((text, index) => {
    doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
    doc.rect(x, y, columnWidths[index], 25).stroke();
    x += columnWidths[index];
  });
}

async function getExpectedIncomePerBillType(req, res) {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.user; // For audit logging
  const month = req.query.month || new Date().toISOString().slice(0, 7); // Default to current month

  if (!tenantId) {
    return res.status(401).json({ message: 'Tenant not identified.' });
  }

  try {
    console.log(`Generating expected income per bill type report for tenantId: ${tenantId}, month: ${month}`);

    // Parse month for date range (e.g., 2025-07 -> 2025-07-01 to 2025-07-31)
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }
    const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    // Fetch invoices with customer, unit, and building details
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        invoicePeriod: {
          gte: startDate,
          lte: endDate,
        },
        customer: { status: 'ACTIVE' }, // Only active customers
      },
      select: {
        id: true,
        invoiceAmount: true,
        invoiceType: true,
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

    console.log(`Total invoices found: ${invoices.length}`);
    invoices.forEach((inv) => {
      console.log(
        `Invoice ${inv.id}: Type=${inv.invoiceType}, Amount=${inv.invoiceAmount}, CustomerId=${inv.customer?.id || 'null'}, BuildingId=${inv.customer?.unit?.building?.id || 'null'}`
      );
    });

    // Fetch tenant details
    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant details not found.' });
    }

    // Initialize landlord data
    const landlordData = new Map();

    for (const invoice of invoices) {
      const customer = invoice.customer;
      if (!customer?.unit?.building) {
        console.warn(`Invoice ${invoice.id} skipped: No valid unit or building`);
        continue;
      }

      const building = customer.unit.building;
      const landlordId = building.landlord.id;
      const landlordName = `${building.landlord.firstName} ${building.landlord.lastName}`.trim();
      const buildingId = building.id;

      // Validate managementRate
      const managementRate = (building.managementRate || 0) / 100;
      if (managementRate < 0) {
        console.warn(`Invalid management rate for building ${buildingId}: ${building.managementRate}`);
        continue;
      }

      if (!landlordData.has(landlordId)) {
        landlordData.set(landlordId, {
          landlordName,
          buildings: new Map(),
          totalRentPlusIncome: 0,
          totalWaterIncome: 0,
          totalManagementFees: 0,
        });
      }

      const landlordEntry = landlordData.get(landlordId);

      if (!landlordEntry.buildings.has(buildingId)) {
        landlordEntry.buildings.set(buildingId, {
          name: building.name,
          totalRentPlusIncome: 0,
          totalWaterIncome: 0,
          managementFees: 0,
          managementRate,
        });
      }

      const buildingEntry = landlordEntry.buildings.get(buildingId);
      const invoiceAmount = invoice.invoiceAmount || 0;

      if (invoice.invoiceType === InvoiceType.RENT_PLUS) {
        buildingEntry.totalRentPlusIncome += invoiceAmount;
        landlordEntry.totalRentPlusIncome += invoiceAmount;
        const managementFees = invoiceAmount * buildingEntry.managementRate;
        buildingEntry.managementFees += managementFees;
        landlordEntry.totalManagementFees += managementFees;
        console.log(`Applied management fee for ${InvoiceType.RENT_PLUS} invoice ${invoice.id}: ${managementFees}`);
      } else if (invoice.invoiceType === InvoiceType.WATER) {
        buildingEntry.totalWaterIncome += invoiceAmount;
        landlordEntry.totalWaterIncome += invoiceAmount;
        console.log(`No management fee applied for ${InvoiceType.WATER} invoice ${invoice.id}`);
      } else {
        console.warn(`Invoice ${invoice.id} has unknown invoiceType: ${invoice.invoiceType}`);
      }
    }

    console.log(`Landlords with expected income: ${landlordData.size}`);

    // Generate PDF
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });
    const filePath = path.join(reportsDir, `expected-income-per-bill-type_${month}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expected-income-per-bill-type_${month}.pdf"`);
    doc.pipe(res);

    generatePDFHeader(doc, tenant);
    doc.font('Helvetica').fontSize(12).text(`Expected Income per Bill Type Report - ${month}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(10).text('Note: Management fees apply only to Rent+ income, not Water income.', 50, doc.y, { align: 'left' });
    doc.moveDown(1);

    const columnWidths = [100, 100, 80, 80, 80, 80];
    const startX = 50;

    drawTableRow(
      doc,
      doc.y,
      ['Landlord Name', 'Building Name', 'Rent+ Income', 'Water Income', 'Management Fees', 'Net Amount'],
      columnWidths,
      startX,
      true
    );
    let rowY = doc.y + 30;

    // Check if report is empty
    if (landlordData.size === 0) {
      doc.font('Helvetica').fontSize(10).text('No invoices recorded for this period.', startX, rowY, { align: 'center' });
      doc.end();
      // Log audit for empty report
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'Generated Expected Income per Bill Type Report',
          details: { month, status: 'Empty', note: 'No invoices found' },
          timestamp: new Date(),
        },
      });
      return;
    }

    let grandTotalRentPlusIncome = 0;
    let grandTotalWaterIncome = 0;
    let grandTotalManagementFees = 0;

    // Generate report by landlord
    for (const [landlordId, landlordEntry] of landlordData) {
      const landlordTotalIncome = landlordEntry.totalRentPlusIncome + landlordEntry.totalWaterIncome;
      const landlordNet = landlordTotalIncome - landlordEntry.totalManagementFees;

      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
        drawTableRow(
          doc,
          doc.y,
          ['Landlord Name', 'Building Name', 'Rent+ Income', 'Water Income', 'Management Fees', 'Net Amount'],
          columnWidths,
          startX,
          true
        );
        rowY = doc.y + 30;
      }

      drawTableRow(
        doc,
        rowY,
        [
          landlordEntry.landlordName,
          '',
          `Ksh${landlordEntry.totalRentPlusIncome.toFixed(2)}`,
          `Ksh${landlordEntry.totalWaterIncome.toFixed(2)}`,
          `Ksh${landlordEntry.totalManagementFees.toFixed(2)}`,
          `Ksh${landlordNet.toFixed(2)}`,
        ],
        columnWidths,
        startX,
        false,
        true
      );
      rowY += 30;

      for (const buildingEntry of landlordEntry.buildings.values()) {
        const buildingTotalIncome = buildingEntry.totalRentPlusIncome + buildingEntry.totalWaterIncome;
        const netAmount = buildingTotalIncome - buildingEntry.managementFees;

        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          drawTableRow(
            doc,
            doc.y,
            ['Landlord Name', 'Building Name', 'Rent+ Income', 'Water Income', 'Management Fees', 'Net Amount'],
            columnWidths,
            startX,
            true
          );
          rowY = doc.y + 30;
        }

        drawTableRow(
          doc,
          rowY,
          [
            '',
            buildingEntry.name,
            buildingEntry.totalRentPlusIncome > 0 ? `Ksh${buildingEntry.totalRentPlusIncome.toFixed(2)}` : 'Ksh0.00',
            buildingEntry.totalWaterIncome > 0 ? `Ksh${buildingEntry.totalWaterIncome.toFixed(2)}` : 'Ksh0.00',
            buildingEntry.totalRentPlusIncome > 0 ? `Ksh${buildingEntry.managementFees.toFixed(2)}` : 'Ksh0.00',
            buildingTotalIncome > 0 ? `Ksh${netAmount.toFixed(2)}` : 'Ksh0.00',
          ],
          columnWidths,
          startX
        );
        rowY += 30;
      }

      grandTotalRentPlusIncome += landlordEntry.totalRentPlusIncome;
      grandTotalWaterIncome += landlordEntry.totalWaterIncome;
      grandTotalManagementFees += landlordEntry.totalManagementFees;
    }

    // Grand total
    if (rowY > 700) {
      doc.addPage();
      rowY = 50;
      drawTableRow(
        doc,
        doc.y,
        ['Landlord Name', 'Building Name', 'Rent+ Income', 'Water Income', 'Management Fees', 'Net Amount'],
        columnWidths,
        startX,
        true
      );
      rowY = doc.y + 30;
    }

    const grandTotalIncome = grandTotalRentPlusIncome + grandTotalWaterIncome;
    const grandTotalNet = grandTotalIncome - grandTotalManagementFees;
    drawTableRow(
      doc,
      rowY,
      [
        '',
        'Grand Total',
        grandTotalRentPlusIncome > 0 ? `Ksh${grandTotalRentPlusIncome.toFixed(2)}` : 'Ksh0.00',
        grandTotalWaterIncome > 0 ? `Ksh${grandTotalWaterIncome.toFixed(2)}` : 'Ksh0.00',
        grandTotalRentPlusIncome > 0 ? `Ksh${grandTotalManagementFees.toFixed(2)}` : 'Ksh0.00',
        grandTotalIncome > 0 ? `Ksh${grandTotalNet.toFixed(2)}` : 'Ksh0.00',
      ],
      columnWidths,
      startX,
      false,
      true
    );

    // Add footer with timestamp
    doc.moveDown(2);
    doc.fontSize(8).text(`Generated on July 2, 2025, 03:24 PM EAT`, startX, doc.y, { align: 'center' });

    doc.end();

    // Log audit for successful report generation
  
  } catch (error) {
    console.error('Error generating expected income per bill type report:', error);
    // Log audit for error

    return res.status(500).json({ error: 'Error generating report', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
}


module.exports = {
  getExpectedIncomePerBillType}