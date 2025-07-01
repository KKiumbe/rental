const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { fetchTenant } = require('../tenants/tenantupdate.js');
const { getSMSConfigForTenant } = require('../smsConfig/getSMSConfig.js');
const { generatePDFHeader } = require('./header.js');




async function generateInvoicePDF(invoiceId) {
  try {
    if (!invoiceId || typeof invoiceId !== 'string') {
      throw new Error('invoiceId must be a valid string');
    }

    // Fetch invoice with optimized select
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        InvoiceItem: {
          select: {
            description: true,
            quantity: true,
            amount: true,
          },
          take: 100, // Limit items to prevent performance issues
        },
        invoicePeriod: true,
        tenantId: true,
        invoiceAmount: true,
        amountPaid: true,
        status: true,
        closingBalance: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const tenant = await fetchTenant(invoice.tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Fetch MPesa configuration
    const mpesaConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId: invoice.tenantId },
      select: { shortCode: true },
    });
    if (!mpesaConfig || !mpesaConfig.shortCode) {
      console.warn('MPesa config incomplete; missing shortCode');
    }

    // Fetch SMS configuration
    const smsConfig = await getSMSConfigForTenant(invoice.tenantId);
    if (!smsConfig || !smsConfig.customerSupportPhoneNumber) {
      console.warn('SMS config incomplete; missing customerSupportPhoneNumber');
    }

    const doc = new PDFDocument({ margin: 50 });
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);

    // Ensure invoices directory exists
    const invoicesDir = path.dirname(pdfPath);
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Generate the header
    await generatePDFHeader(doc, tenant);

    // Debug: Log current Y position
    console.log('Y position after header:', doc.y);

    // Invoice title
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('Invoice', 250, 190, { align: 'center' });

    // Map InvoiceStatus to display text
    let paymentStatus;
    switch (invoice.status) {
      case 'PAID':
        paymentStatus = 'Paid';
        break;
      case 'PPAID':
        paymentStatus = 'Partially Paid';
        break;
      case 'UNPAID':
        paymentStatus = 'Unpaid';
        break;
      case 'CANCELLED':
        paymentStatus = 'Cancelled';
        break;
      default:
        paymentStatus = 'Unknown';
    }

    // Invoice details
    const invoiceDate = new Date(invoice.invoicePeriod);
    if (isNaN(invoiceDate.getTime())) {
      throw new Error('Invalid invoicePeriod date');
    }
    const options = { month: 'long', year: 'numeric' };
    const formattedPeriod = invoiceDate.toLocaleDateString('en-US', options);

    doc.fontSize(12)
       .font('Helvetica')
       .text(`Invoice Period: ${formattedPeriod}`, 50, 230)
       .text(`Invoice Date: ${invoiceDate.toDateString()}`, 50, 250)
       .text(`Customer: ${invoice.customer.firstName} ${invoice.customer.lastName}`, 50, 270)
       .font('Helvetica-Bold')
       .text(`Payment Status: ${paymentStatus}`, 50, 290)
       .font('Helvetica')
       .text(`Amount Paid: Ksh ${invoice.amountPaid.toFixed(2)}`, 50, 310)
       .text(`Balance Due: Ksh ${invoice.closingBalance.toFixed(2)}`, 50, 330);

    // Initialize currentY and totalAmount
    let currentY = 350;
    let totalAmount = invoice.invoiceAmount ?? invoice.closingBalance ?? 0;

    // Add invoice items
    if (invoice.InvoiceItem && invoice.InvoiceItem.length > 0) {
      doc.moveDown(1);
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('Items', 50, doc.y);

      // Table headers
      const tableTop = doc.y + 10;
      doc.fontSize(10)
         .text('Description', 50, tableTop)
         .text('Quantity', 300, tableTop)
         .text('Unit Price', 400, tableTop)
         .text('Total', 500, tableTop);

      // Table content
      currentY = tableTop + 20;
      totalAmount = 0;
      invoice.InvoiceItem.forEach((item) => {
        const quantity = item.quantity ?? 0;
        const amount = item.amount ?? 0;
        const total = quantity * amount;
        doc.text(item.description || 'N/A', 50, currentY)
           .text(quantity.toString(), 300, currentY)
           .text(amount.toFixed(2), 400, currentY)
           .text(total.toFixed(2), 500, currentY);
        totalAmount += total;
        currentY += 20;

        // Check for page overflow
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }
      });

      // Total
      doc.moveDown(1);
      currentY = doc.y;
      doc.font('Helvetica-Bold')
         .text(`Total: Ksh ${totalAmount.toFixed(2)}`, 500, currentY);
      currentY += 20;
    } else {
      doc.moveDown(1);
      currentY = doc.y;
      doc.text('No items found for this invoice.', 50, currentY);
      currentY += 20;
    }

    // Payment Instructions (only for UNPAID or PPAID)
    if (paymentStatus === 'Unpaid' || paymentStatus === 'Partially Paid') {
      doc.moveDown(1);
      const paymentY = currentY > 700 ? 50 : currentY;
      if (paymentY === 50) doc.addPage();

      doc.fontSize(14)
         .font('Helvetica-Bold')
         .text('Payment Instructions', 50, paymentY);

      doc.fontSize(10)
         .font('Helvetica')
         .text('Please make your payment using the following details:', 50, paymentY + 20);

      const paymentDetailsY = paymentY + 40;
      doc.text('Payment Method: MPesa', 50, paymentDetailsY)
         .font('Helvetica-Bold')
         .text(`Paybill Number: ${mpesaConfig?.shortCode || 'Not Available'}`, 50, paymentDetailsY + 15)
         .text(`Account Number: ${invoice.customer.phoneNumber}`, 50, paymentDetailsY + 30)
         .font('Helvetica')
         .text('Steps:', 50, paymentDetailsY + 50)
         .text('1. Go to MPesa on your phone.', 60, paymentDetailsY + 65)
         .text('2. Select Lipa na MPesa > Paybill.', 60, paymentDetailsY + 80)
         .text(`3. Enter Paybill Number: ${mpesaConfig?.shortCode || 'Not Available'}`, 60, paymentDetailsY + 95)
         .text(`4. Enter Account Number: ${invoice.customer.phoneNumber}`, 60, paymentDetailsY + 110)
         .text(`5. Enter Amount: Ksh ${invoice.closingBalance.toFixed(2)}`, 60, paymentDetailsY + 125)
         .text('6. Confirm the transaction.', 60, paymentDetailsY + 140);

      // Update currentY
      currentY = paymentDetailsY + 160;
    }

    // Customer Support
    doc.text(
      `For assistance, contact Customer Support: ${smsConfig?.customerSupportPhoneNumber || 'Not Available'}`,
      50,
      currentY + 20
    );

    // Finalize the PDF
    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log('PDF generated successfully:', pdfPath);
        resolve(pdfPath);
      });
      writeStream.on('error', (err) => {
        console.error('Write stream error:', err);
        reject(new Error(`Failed to write PDF: ${err.message}`));
      });
    });
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}




async function downloadInvoice(req, res) {
  const { invoiceId } = req.params;

  if (!invoiceId) {
    return res.status(400).json({ message: 'invoiceId is required' });
  }

  try {
    const pdfPath = await generateInvoicePDF(invoiceId);

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found at ${pdfPath}`);
    }

    res.download(pdfPath, `invoice-${invoiceId}.pdf`, (err) => {
      if (err) {
        console.error('Error downloading invoice:', err);
        return res.status(500).json({ message: 'Error downloading invoice' });
      }

      // Delete file after download
      try {
        fs.unlinkSync(pdfPath);
        console.log('PDF file deleted:', pdfPath);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    });
  } catch (error) {
    console.error('Error generating or downloading invoice:', error);
    res.status(500).json({ message: error.message || 'Error generating or downloading invoice' });
  }
}

module.exports = { generateInvoicePDF, downloadInvoice };