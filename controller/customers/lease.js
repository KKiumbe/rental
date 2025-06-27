
const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const generateLeaseAgreement = async (req, res) => {
  const { tenantId, user } = req.user;
  const { customerId } = req.body;

  // Validate input
  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Required field: customerId',
    });
  }

  try {
    // Validate tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found.',
      });
    }

    // Validate user
    const currentUser = await prisma.user.findUnique({
      where: { id: user },
      select: { tenantId: true, firstName: true, lastName: true },
    });
    if (!currentUser || currentUser.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Authenticated user not found or does not belong to tenant.',
      });
    }

    // Validate customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { unit: true },
    });
    if (!customer || customer.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found or does not belong to tenant.',
      });
    }
    if (!customer.unitId || !customer.unit) {
      return res.status(400).json({
        success: false,
        message: 'Customer is not assigned to a unit.',
      });
    }

    // Generate lease PDF
    const doc = new PDFDocument();
    const leasesDir = path.join(__dirname, 'leases');
    if (!fs.existsSync(leasesDir)) {
      fs.mkdirSync(leasesDir, { recursive: true });
    }
    const leaseFilePath = path.join(leasesDir, `${customerId}-${Date.now()}.pdf`);
    const stream = fs.createWriteStream(leaseFilePath);
    doc.pipe(stream);

    // Populate template
    doc.fontSize(16).text('Lease Agreement', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Tenant: ${customer.firstName} ${customer.lastName}`);
    doc.text(`Email: ${customer.email || 'N/A'}`);
    doc.text(`Phone: ${customer.phoneNumber}`);
    doc.moveDown();
    doc.text(`Unit Number: ${customer.unit.unitNumber}`);
    doc.text(`Monthly Rent: $${customer.unit.monthlyCharge}`);
    doc.text(`Security Deposit: $${customer.unit.depositAmount}`);
    if (customer.unit.garbageCharge) {
      doc.text(`Garbage Charge: $${customer.unit.garbageCharge}`);
    }
    if (customer.unit.serviceCharge) {
      doc.text(`Service Charge: $${customer.unit.serviceCharge}`);
    }
    doc.moveDown();
    doc.text('Lease Start Date: ____________________');
    doc.text('Signature: ____________________');
    doc.end();

    // Wait for file to be written
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Placeholder for cloud storage (e.g., AWS S3)
    const leaseFileUrl = `https://example.com/leases/${path.basename(leaseFilePath)}`;
    // Example S3 upload:
    // const uploadResult = await uploadToS3(leaseFilePath, customerId);
    // leaseFileUrl = uploadResult.url;

    // Update customer with leaseFileUrl
    await prisma.customer.update({
      where: { id: customerId },
      data: { leaseFileUrl },
    });

    // Log user activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Generated lease agreement for customer ${customerId} by ${currentUser.firstName} ${currentUser.lastName}`,
        timestamp: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Lease agreement generated successfully',
      data: { leaseFileUrl },
    });
  } catch (error) {
    console.error('Error generating lease agreement:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { generateLeaseAgreement };