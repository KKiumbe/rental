const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

async function generatePDFHeader(doc, tenant) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('PDF document object is required');
  }
  if (!tenant || typeof tenant !== 'object') {
    throw new Error('Tenant data is required');
  }

  // Configuration for styling
  const headerConfig = {
    dividerColor: tenant.brandColor || '#007bff',
    logoWidth: 80, // Reduced to minimize overlap risk
    font: {
      title: 'Helvetica-Bold',
      details: 'Helvetica',
      titleSize: 20,
      detailsSize: 10,
    },
    margins: { left: 50, right: 50, top: 20, bottom: 20 },
    headerHeight: 150,
    lineHeight: 15,
  };

  // Add logo in top-right corner
  let logoPath;
  let logoHeight = headerConfig.logoWidth; // Assume square logo for initial estimate
  if (tenant.logoUrl && typeof tenant.logoUrl === 'string') {
    if (tenant.logoUrl.startsWith('http')) {
      try {
        const logoCachePath = path.join(__dirname, '..', 'Uploads', `logo-${tenant.id}.png`);
        if (await fs.access(logoCachePath).catch(() => false)) {
          logoPath = logoCachePath;
        } else {
          const response = await axios.get(tenant.logoUrl, { responseType: 'arraybuffer' });
          await fs.writeFile(logoCachePath, response.data);
          logoPath = logoCachePath;
        }
      } catch (error) {
        console.warn(`⚠️ Failed to download logo from ${tenant.logoUrl}: ${error.message}`);
      }
    } else {
      logoPath = path.join(__dirname, '..', 'Uploads', path.basename(tenant.logoUrl));
    }

    if (logoPath) {
      try {
        await fs.access(logoPath);
        // Place logo in top-right corner
        const logoX = doc.page.width - headerConfig.margins.right - headerConfig.logoWidth;
        doc.image(logoPath, logoX, headerConfig.margins.top, {
          width: headerConfig.logoWidth,
          align: 'right',
        });
        // Estimate logo height (assuming aspect ratio is preserved)
        logoHeight = headerConfig.logoWidth; // Adjust if actual height is known
      } catch (error) {
        console.warn(`⚠️ Failed to load logo at ${logoPath}: ${error.message}`);
      }
      // Clean up temporary file if downloaded
      if (tenant.logoUrl.startsWith('http') && logoPath) {
        await fs.unlink(logoPath).catch((err) => console.warn(`⚠️ Failed to delete temp logo: ${err.message}`));
      }
    }
  }

  // Tenant name (centered, bold)
  doc.font(headerConfig.font.title)
     .fontSize(headerConfig.font.titleSize)
     .fillColor('#333333')
     .text(tenant.name || 'Unnamed Tenant', 0, headerConfig.margins.top + 10, {
       align: 'center',
       width: doc.page.width,
     });

  // Tenant details in a structured grid
  const details = [
    { label: 'Street', value: tenant.street || 'N/A' },
    { label: 'Phone', value: tenant.phoneNumber || 'N/A' },
    { label: 'Email', value: tenant.email || 'N/A' },
    { label: 'County', value: tenant.county || 'N/A' },
    { label: 'Town', value: tenant.town || 'N/A' },
    { label: 'Address', value: tenant.address || 'N/A' },
    { label: 'Building', value: tenant.building || 'N/A' },
  ];

  const leftColumn = details.slice(0, Math.ceil(details.length / 2));
  const rightColumn = details.slice(Math.ceil(details.length / 2));
  // Adjust detailsY to account for logo and tenant name
  const detailsY = headerConfig.margins.top + Math.max(30 + headerConfig.font.titleSize, logoHeight) + 10;

  doc.font(headerConfig.font.details)
     .fontSize(headerConfig.font.detailsSize)
     .fillColor('#555555');

  // Left column
  leftColumn.forEach((item, index) => {
    doc.text(`${item.label}: ${item.value}`, headerConfig.margins.left, detailsY + index * headerConfig.lineHeight);
  });

  // Right column
  rightColumn.forEach((item, index) => {
    doc.text(`${item.label}: ${item.value}`, doc.page.width / 2, detailsY + index * headerConfig.lineHeight);
  });

  // Calculate divider position
  const maxRows = Math.max(leftColumn.length, rightColumn.length);
  const dividerY = detailsY + maxRows * headerConfig.lineHeight + 15;

  // Divider line
  doc.moveTo(headerConfig.margins.left, dividerY)
     .lineTo(doc.page.width - headerConfig.margins.right, dividerY)
     .lineWidth(1.5)
     .strokeColor(headerConfig.dividerColor)
     .stroke();

  // Reset styles and position
  doc.fillColor('#000000')
     .moveDown(2);

  // Debug: Log positions
  console.log('Logo Y range:', headerConfig.margins.top, 'to', headerConfig.margins.top + logoHeight);
  console.log('Details Y range:', detailsY, 'to', detailsY + maxRows * headerConfig.lineHeight);
  console.log('Divider Y position:', dividerY);
  console.log('Header Y position:', doc.y);
}

module.exports = { generatePDFHeader };