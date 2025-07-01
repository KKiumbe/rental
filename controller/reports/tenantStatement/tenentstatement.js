const { PrismaClient, CustomerStatus } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const path = require('path');
const { generatePDFHeader } = require('../header');
const fsPromises = require('fs').promises;
const prisma = new PrismaClient();

async function getCustomerStatement(req, res) {
  const tenantId = req.user?.tenantId;
  const { customerId, startDate, endDate } = req.body;

  // Validate inputs
  if (!tenantId) {
    return res.status(401).json({ message: 'Tenant not identified.' });
  }
  if (!customerId || !startDate || !endDate) {
    return res.status(400).json({ message: 'Customer ID, start date, and end date are required.' });
  }

  // Validate date format and normalize to start/end of day
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0); // Start of the day
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999); // End of the day
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return res.status(400).json({ message: 'Invalid date range. Use YYYY-MM-DD format and ensure startDate is before endDate.' });
  }

  try {
    console.log(`Generating customer statement for tenantId: ${tenantId}, customerId: ${customerId}, date range: ${startDate} to ${endDate}`);
    console.log(`Normalized start: ${start.toISOString()}, end: ${end.toISOString()}`);

    // Fetch customer details
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
        status: CustomerStatus.ACTIVE,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        email: true,
        closingBalance: true,
        unit: {
          select: {
            unitNumber: true,
            building: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found or inactive.' });
    }

    // Fetch invoices within the date range
    const invoices = await prisma.invoice.findMany({
      where: {
        customerId,
        tenantId,
        invoicePeriod: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoicePeriod: true,
        invoiceAmount: true,
        amountPaid: true,
        closingBalance: true,
        status: true,
        createdAt: true,
        InvoiceItem: {
          select: {
            description: true,
            amount: true,
            quantity: true,
          },
        },
      },
      orderBy: { invoicePeriod: 'asc' },
      take: 1000,
    });

    // Fetch payments within the date range
    const payments = await prisma.payment.findMany({
      where: {
        customerId,
        tenantId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        id: true,
        amount: true,
        modeOfPayment: true,
        transactionId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });

    console.log(`Fetched ${invoices.length} invoices and ${payments.length} payments`);
    console.log('Payment details:', payments.map(p => ({
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      amount: p.amount,
      transactionId: p.transactionId,
      modeOfPayment: p.modeOfPayment,
    })));

    // Fetch tenant details for header
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        email: true,
        phoneNumber: true,
        logoUrl: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant details not found.' });
    }

    // Combine invoices and payments into a single transaction list
    const transactions = [
      ...invoices.map((invoice) => ({
        type: '"Invoice"',
        date: invoice.invoicePeriod,
        reference: invoice.invoiceNumber,
        debit: invoice.invoiceAmount,
        credit: 0,
        balance: invoice.closingBalance,
        details: Array.isArray(invoice.InvoiceItem)
          ? invoice.InvoiceItem.map((item) => `${item.description}: Ksh ${item.amount.toFixed(2)} x ${item.quantity}`).join(', ')
          : 'No items',
      })),
      ...payments.map((payment) => ({
        type: '"Payment"',
        date: payment.createdAt,
        reference: payment.transactionId || 'N/A',
        debit: 0,
        credit: payment.amount,
        balance: null, // Will be calculated
        details: payment.modeOfPayment,
      })),
    ];

    // Sort transactions by date
    transactions.sort((a, b) => a.date - b.date);

    // Calculate running balance
    let runningBalance = 0;
    const previousInvoice = await prisma.invoice.findFirst({
      where: {
        customerId,
        tenantId,
        invoicePeriod: { lt: start },
      },
      select: { closingBalance: true },
      orderBy: { invoicePeriod: 'desc' },
    });
    if (previousInvoice) {
      runningBalance = previousInvoice.closingBalance;
    }

    transactions.forEach((txn) => {
      if (txn.type === '"Invoice"') {
        runningBalance = txn.balance; // Use invoice's closingBalance
      } else {
        runningBalance -= txn.credit; // Subtract payment amount
        txn.balance = runningBalance;
      }
    });

    // Calculate totals
    const totalDebits = transactions.reduce((sum, txn) => sum + txn.debit, 0);
    const totalCredits = transactions.reduce((sum, txn) => sum + txn.credit, 0);
    const finalBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : runningBalance;

    // Generate PDF
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });
    const filePath = path.join(reportsDir, `customer_statement_${customerId}_${startDate}_to_${endDate}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="customer_statement_${customerId}_${startDate}_to_${endDate}.pdf"`);
    doc.pipe(res);

    // PDF Header
    generatePDFHeader(doc, tenant);

    // Customer Details
    doc.font('Helvetica-Bold').fontSize(12).text('Customer Statement', { align: 'center' });
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Customer: ${customer.firstName} ${customer.lastName}`);
    doc.text(`Phone: ${customer.phoneNumber}`);
    if (customer.email) doc.text(`Email: ${customer.email}`);
    if (customer.unit) {
      doc.text(`Unit: ${customer.unit.unitNumber}`);
      doc.text(`Building: ${customer.unit.building.name}`);
    }
    doc.text(`Statement Period: ${startDate} to ${endDate}`);
    doc.moveDown(2);

    // Transactions Table
    doc.font('Helvetica-Bold').fontSize(12).text('Transactions', { align: 'left' });
    const columnWidths = [50, 50, 170, 60, 60, 60];
    const startX = 50;

    drawTableRow(doc, doc.y, ['Date', 'Type', 'Reference', 'Debit', 'Credit', 'Balance'], columnWidths, startX, true);
    let rowY = doc.y + 30;

    if (transactions.length === 0) {
      doc.font('Helvetica').fontSize(10).text('No transactions for this period.', startX, rowY);
      rowY += 30;
    } else {
      for (const txn of transactions) {
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          drawTableRow(doc, doc.y, ['Date', 'Type', 'Reference', 'Debit', 'Credit', 'Balance'], columnWidths, startX, true);
          rowY = doc.y + 30;
        }

        drawTableRow(doc, rowY, [
          txn.date.toISOString().slice(0, 10),
          txn.type,
          txn.reference,
          txn.debit > 0 ? `Ksh ${txn.debit.toFixed(2)}` : '',
          txn.credit > 0 ? `Ksh ${txn.credit.toFixed(2)}` : '',
          `Ksh ${txn.balance.toFixed(2)}`,
        ], columnWidths, startX);
        rowY += 30;

        // Add details row
        if (txn.details) {
          if (rowY > 700) {
            doc.addPage();
            rowY = 50;
            drawTableRow(doc, doc.y, ['Date', 'Type', 'Reference', 'Debit', 'Credit', 'Balance'], columnWidths, startX, true);
            rowY = doc.y + 30;
          }
          drawTableRow(doc, rowY, ['', 'Details:', txn.details, '', '', ''], columnWidths, startX, false, true);
          rowY += 30;
        }
      }
    }

    // Summary
    doc.moveDown(3);
    doc.font('Helvetica-Bold').fontSize(12).text('Summary', { align: 'left' });
    rowY = doc.y + 20;
    drawTableRow(doc, rowY, ['', 'Total Debits', 'Total Credits', 'Final Balance', '', ''], columnWidths, startX, true);
    rowY += 30;
    drawTableRow(doc, rowY, [
      '',
      `Ksh ${totalDebits.toFixed(2)}`,
      `Ksh ${totalCredits.toFixed(2)}`,
      `Ksh ${finalBalance.toFixed(2)}`,
      '',
      '',
    ], columnWidths, startX, false, true);

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating customer statement:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Error generating statement', details: error.message });
    }
  } finally {
    await prisma.$disconnect();
  }
}

function drawTableRow(doc, y, data, columnWidths, startX = 50, isHeader = false, isBold = false) {
  let x = startX;
  doc.font(isBold || isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
  data.forEach((text, index) => {
    doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
    doc.rect(x, y, columnWidths[index], 25).stroke();
    x += columnWidths[index];
  });
}

module.exports = { getCustomerStatement };