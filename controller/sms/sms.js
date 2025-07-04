const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const {getSMSConfigForTenant }= require('../smsConfig/getSMSConfig.js')
const {fetchTenant} = require('../tenants/tenantupdate.js')
const { v4: uuidv4 } = require('uuid');
const { generatePaymentLink } = require('../mpesa/stkpush.js');


const prisma = new PrismaClient();

// const SMS_API_KEY = process.env.SMS_API_KEY;
// const PARTNER_ID = process.env.PARTNER_ID;
// const SHORTCODE = process.env.SHORTCODE;
const SMS_ENDPOINT = process.env.SMS_ENDPOINT;
const BULK_SMS_ENDPOINT = process.env.BULK_SMS_ENDPOINT;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;


// const customerSupport =  process.env.CUSTOMER_SUPPORT;


async function getShortCode(tenantId) {
  try {
    const config = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
      select: { shortCode: true },
    });

    return config ? config.shortCode : null;
  } catch (error) {
    console.error("Error fetching shortCode:", error);
    return null;
  }
}








const checkSmsBalance = async (apiKey, partnerId) => {
    if (!apiKey || !partnerId) {
      throw new Error('API key or partner ID is missing');
    }
  
    console.log(`Checking SMS balance with apiKey: ${apiKey} and partnerId: ${partnerId}`);
  
    try {
      const response = await axios.post(SMS_BALANCE_URL, {
        apikey: apiKey,
        partnerID: partnerId,
      });
      console.log('SMS balance:', response.data.balance);
      return response.data.balance;
    } catch (error) {
      console.error('Error checking SMS balance:', error.response?.data || error.message);
      throw new Error('Failed to retrieve SMS balance');
    }
  };
  
  



const sanitizePhoneNumber = (phone) => {
  if (typeof phone !== 'string') return '';
  if (phone.startsWith('+254')) return phone.slice(1);
  if (phone.startsWith('0')) return `254${phone.slice(1)}`;
  if (phone.startsWith('254')) return phone;
  return `254${phone}`;
};



const getSmsBalance = async (req, res) => {
  const { tenantId } = req.user;
  let apikey, partnerID;

  try {
    // Fetch SMS config
    ({ apikey, partnerID } = await getSMSConfigForTenant(tenantId));
    console.log(`this is the api key ${apikey}`);

    // Make API call to get SMS balance
    const response = await axios.post(SMS_BALANCE_URL, {
      apikey: apikey,
      partnerID: partnerID,
    });
    console.log('SMS balance:', response.data.credit);

    // Return successful response
    return res.status(200).json({ credit: response.data.credit });
  } catch (error) {
    // Log the error for debugging
    console.error('Error checking SMS balance:', error.response?.data || error.message);

    // Return a controlled error response instead of throwing
    return res.status(500).json({
      error: 'Failed to retrieve SMS balance',
      details: error.response?.data || error.message,
    });
  }
};
  




const sendToOne = async (req, res) => {

    const { tenantId } = req.user; 
    console.log(`this is the tenant id ${tenantId}`);

  const { mobile, message } = req.body;
  try {
      const response = await sendSMS(tenantId,mobile, message);
      res.status(200).json({ success: true, response });
  } catch (error) {
      console.error('Error in sendToOne:', error.message);
      res.status(500).json({ success: false, message: error.message });
  }
};




const sendSMS = async (tenantId, mobile, message) => {
    console.log(`Sending SMS to ${mobile}`);
    let clientsmsid;
  
    try {
      // Fetch SMS configuration for the tenant
      const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);
  
    
  
      // Sanitize phone number
      const sanitizedPhoneNumber = sanitizePhoneNumber(mobile);
  
      // Fetch the customer ID from the database
      
  
      // Generate unique clientsmsid
      clientsmsid = uuidv4();
  
      console.log(`Creating SMS record with clientsmsid: ${clientsmsid} for customerId:`);
  
      // Create SMS record in the database
      const smsRecord = await prisma.sMS.create({
        data: {
          tenantId, // ✅ Add this line
          clientsmsid,
          mobile: sanitizedPhoneNumber,
          message,
          status: 'sent',
        },
      });
      
  
      console.log(`SMS record created: ${JSON.stringify(smsRecord)}`);
  
      // Prepare SMS payload
      const payload = {
        apikey,
        partnerID,
       
        message,
        shortcode:shortCode,
        mobile
      };
  
      console.log(`Sending SMS with payload: ${JSON.stringify(payload)}`);
  
      // Send SMS
     
      try {
        const response = await axios.post(SMS_ENDPOINT, payload);
        console.log(`SMS sent successfully to ${mobile}:`, response.data);
        return response.data;
      } catch (error) {
        console.error('Error sending SMS:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
          mobile,
        });
        throw new Error('Failed to send SMS');
      }
      

  
      console.log('SMS sent successfully. Updating status to "sent".');
  
      // Update SMS record to "sent"
      await prisma.sMS.update({
        where: { id: smsRecord.id },
        data: { status: 'sent' },
      });
  
      return response.data;
    } catch (error) {
      console.error('Error sending SMS:', {
        message: error.message,
        stack: error.stack,
        mobile,
      });
  
      // Handle failed SMS
      if (clientsmsid) {
        try {
          await prisma.sMS.update({
            where: { clientsmsid },
            data: { status: 'failed' },
          });
          console.log(`SMS status updated to "failed" for clientsmsid: ${clientsmsid}`);
        } catch (updateError) {
          console.error('Error updating SMS status to "failed":', updateError.message);
        }
      }
  
      throw new Error(error.response ? error.response.data : 'Failed to send SMS.');
    }
  };
  










  

const sendBills = async (req, res) => {
  const { tenantId, user } = req.user;
  const { period } = req.body;

  try {
    // Validate inputs
    if (!tenantId || !user) {
      return res.status(401).json({ error: 'Unauthorized: Tenant ID or user not found.' });
    }
    if (!period) {
      return res.status(400).json({ message: 'Missing required field: period is required.' });
    }

    // Validate period format (YYYY-MM)
    const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!periodRegex.test(period)) {
      return res.status(400).json({ message: 'Invalid period format. Use YYYY-MM (e.g., 2025-04).' });
    }

    // Parse period
    const [year, month] = period.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    if (isNaN(startOfMonth.getTime()) || isNaN(endOfMonth.getTime())) {
      return res.status(400).json({ message: 'Invalid period. Unable to parse date.' });
    }

    // Validate period is in the current year (2025)
    const currentYear = new Date().getFullYear(); // 2025
    if (year !== currentYear) {
      return res.status(400).json({ message: `Period must be in the current year (${currentYear}).` });
    }

    // Convert month to name
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];

    console.log(`Fetching invoices from ${startOfMonth} to ${endOfMonth} for ${monthName}`);

    // Fetch configurations (no transaction)
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
      select: { customerSupportPhoneNumber: true },
    });
    const mpesaConfig = await prisma.mPESAConfig.findFirst({
      where: { tenantId },
      select: { apiKey: true, passKey: true, secretKey: true },
    });
    const paybill = await getShortCode(tenantId);

    if (!smsConfig) {
      return res.status(400).json({ error: 'Missing SMS configuration for tenant.' });
    }
    const customerSupport = smsConfig.customerSupportPhoneNumber;

    if (!mpesaConfig || !mpesaConfig.apiKey || !mpesaConfig.passKey || !mpesaConfig.secretKey) {
      console.warn(`M-Pesa configuration incomplete for tenant ${tenantId}. Payment links will not be included.`);
    }

    // Fetch active customers with invoices
    const activeCustomers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId,
      },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        invoices: {
          where: {
            invoicePeriod: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
            tenantId,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            invoiceAmount: true,
            createdAt: true,
            InvoiceItem: {
              select: { description: true, amount: true },
            },
          },
        },
      },
    });

    if (!activeCustomers.length) {
      return res.status(404).json({ message: 'No active customers found for this tenant.' });
    }

    // Marques: // Determine SMS encoding (for logging purposes only)
    const isUCS2 = /[^\u0000-\u007F]/.test(
      activeCustomers.map(c => `${c.firstName} ${c.invoices[0]?.InvoiceItem.map(i => i.description).join()}`).join()
    );
    console.log(`Using ${isUCS2 ? 'UCS-2' : 'GSM-7'} encoding (no length limit)`);

    // Process customers with Promise.all (batched for concurrency control)
    const messages = [];
    const errors = [];
    const billedCustomerIds = [];
    const concurrencyLimit = 10; // Max concurrent generatePaymentLink calls

    // Helper to process customers in chunks
    const processCustomerChunk = async (customers) => {
      const results = await Promise.all(
        customers.map(async (customer) => {
          try {
            if (!customer.invoices.length) {
              return { customerId: customer.id, error: `No invoice found for period ${period}.` };
            }

            const invoice = customer.invoices[0];
            const mobile = sanitizePhoneNumber(customer.phoneNumber);
            if (!mobile) {
              return { customerId: customer.id, error: 'No valid phone number available.' };
            }

            // Generate payment link
            let linkUrl = '';
            if (mpesaConfig?.apiKey && mpesaConfig?.passKey && mpesaConfig?.secretKey) {
              try {
                linkUrl = await generatePaymentLink(customer.id, tenantId);
              } catch (linkError) {
                console.error(`Failed to generate payment link for customer ${customer.id}:`, linkError);
                return { customerId: customer.id, error: 'Failed to generate payment link.' };
              }
            }

            // Format billed items
            const itemsList = invoice.InvoiceItem.length
              ? invoice.InvoiceItem.map(item => `${item.description}: KES ${item.amount.toFixed(2)}`).join(', ')
              : 'No items specified';
            const totalAmount = invoice.invoiceAmount;

            // Construct SMS message (no length limit)
            const message = `Dear ${customer.firstName}, your bill for ${monthName} is ${itemsList}. Total: KES ${totalAmount.toFixed(2)}. Balance: ${
              customer.closingBalance < 0
                ? 'overpayment of KES ' + Math.abs(customer.closingBalance)
                : 'KES ' + customer.closingBalance
            }. Paybill: ${paybill}, Acct: ${mobile}. Pay now: ${linkUrl} Inquiries? ${customerSupport}`;

            return { customerId: customer.id, mobile, message };
          } catch (error) {
            console.error(`Error processing customer ${customer.id}:`, error);
            return { customerId: customer.id, error: error.message };
          }
        })
      );
      return results;
    };

    // Process customers in chunks to limit concurrency
    for (let i = 0; i < activeCustomers.length; i += concurrencyLimit) {
      const chunk = activeCustomers.slice(i, i + concurrencyLimit);
      const chunkResults = await processCustomerChunk(chunk);

      chunkResults.forEach(result => {
        if (result.error) {
          errors.push({ customerId: result.customerId, message: result.error });
        } else {
          messages.push({ mobile: result.mobile, message: result.message });
          billedCustomerIds.push(result.customerId);
        }
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        message: 'No bills sent due to missing invoices or valid phone numbers.',
        errors,
      });
    }

    // Send SMS in batches
    const batchSize = 500;
    const smsResponses = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      try {
        const batchResponses = await sendSms(tenantId, batch);
        smsResponses.push(...batchResponses);
      } catch (batchError) {
        console.error(`Error sending batch ${i / batchSize + 1}:`, batchError);
        smsResponses.push(
          ...batch.map(msg => ({
            phoneNumber: msg.mobile,
            status: 'error',
            details: batchError.message,
          }))
        );
      }
    }

    // Log activity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Bills sent to ${messages.length} customers`,
        details: {
          customerIds: billedCustomerIds,
          period,
          encoding: isUCS2 ? 'UCS-2' : 'GSM-7',
        },
        timestamp: new Date(),
      },
    });

    res.status(200).json({
      message: 'Bills sent successfully',
      smsResponses,
      errors,
      totalProcessed: activeCustomers.length,
      totalMessagesSent: messages.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error('Error sending bills:', {
      tenantId,
      period,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Failed to send bills.', details: error.message });
  }
};



  const sendCustomSmsAboveBalance = async (req, res) => {
    const { tenantId, user } = req.user;
    const { balance, message: customMessage } = req.body;
  
    // Validate request body
    if (!customMessage || typeof customMessage !== 'string') {
      return res.status(400).json({ error: 'Custom message is required and must be a string.' });
    }
    if (!balance || typeof balance !== 'number' || balance < 0) {
      return res.status(400).json({ error: 'Balance threshold is required and must be a non-negative number.' });
    }
  
    try {
      // Fetch SMS config and paybill
      const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
      const paybill = await getShortCode(tenantId);
   
      // Fetch active customers with closingBalance above the specified threshold
      const eligibleCustomers = await prisma.customer.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          closingBalance: { gt: balance }, // Filter customers with balance > specified threshold
        },
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          closingBalance: true,
        },
      });
  
      if (eligibleCustomers.length === 0) {
        return res.status(200).json({
          message: `No active customers found with balance above ${balance}.`,
        });
      }
  
      const messages = [];
      const errors = [];
      const messagedCustomerIds = [];
  
      // Process each customer
      for (const customer of eligibleCustomers) {
        // Skip if no valid phone number
        const mobile = sanitizePhoneNumber(customer.phoneNumber);
        if (!mobile) {
          errors.push({
            customerId: customer.id,
            message: 'No valid phone number available.',
          });
          continue;
        }
  
        // Construct SMS message similar to sendBills
        const balanceText =
          customer.closingBalance < 0
            ? `overpayment of KES ${Math.abs(customer.closingBalance).toFixed(2)}`
            : `KES ${customer.closingBalance.toFixed(2)}`;
        const smsMessage = `Dear ${customer.firstName}, ${customMessage} Your balance is ${balanceText}. Paybill: ${paybill}, Acct: ${mobile}. Inquiries? ${customerSupport}`;
  
        messages.push({ mobile, message: smsMessage });
        messagedCustomerIds.push(customer.id);
      }
  
      if (messages.length === 0) {
        return res.status(200).json({
          message: 'No valid messages to send due to invalid phone numbers.',
          errors,
        });
      }
  
      // Batch size limit (consistent with sendToAll)
      const batchSize = 500;
      const smsResponses = [];
  
      // Process messages in batches
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        try {
          const batchResponses = await sendSms(tenantId, batch); // Call sendSms with tenantId and batch
          smsResponses.push(...batchResponses);
        } catch (batchError) {
          console.error(`Error sending batch ${i / batchSize + 1}:`, batchError);
          smsResponses.push(
            ...batch.map((msg) => ({
              phoneNumber: msg.mobile,
              status: 'error',
              details: batchError.message,
            }))
          );
        }
      }
  
      // Log to UserActivity (similar to sendBills)
      await prisma.userActivity.create({
        data: {
          user: { connect: { id: user } },
          tenant: { connect: { id: tenantId } },
          action: `Custom SMS sent to ${messages.length} customers with balance above ${balance}`,
          details: {
            customerIds: messagedCustomerIds,
            balanceThreshold: balance,
            customMessage,
          },
          timestamp: new Date(),
        },
      });
  
      // Respond with success message and all SMS responses
      res.status(200).json({
        success: true,
        message: `SMS sent to ${messages.length} customers with balance above ${balance} in ${Math.ceil(messages.length / batchSize)} batches.`,
        count: messages.length,
        totalProcessed: eligibleCustomers.length,
        smsResponses,
        errors,
        totalErrors: errors.length,
      });
    } catch (error) {
      console.error('Error sending custom SMS to customers above balance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send custom SMS to customers.',
        details: error.message,
      });
    } finally {
      await prisma.$disconnect();
    }
  };
  





const sendToAll = async (req, res) => {
  const { tenantId } = req.user;
  const { message } = req.body;

  // Validate request body
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string.' });
  }

  try {
    // Check if SMS configuration exists for the tenant
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
    });

    if (!smsConfig) {
      return res.status(400).json({ error: 'Missing SMS configuration for tenant.' });
    }

    // Fetch active customers
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: { phoneNumber: true }, // Only need phoneNumber for bulk SMS
    });

    if (activeCustomers.length === 0) {
      return res.status(200).json({ message: 'No active customers found.' });
    }

    // Prepare messages using the request body message for all customers
    const messages = activeCustomers.map((customer) => ({
      mobile: sanitizePhoneNumber(customer.phoneNumber), // Assumes sanitizePhoneNumber exists
      message: message, // Use the message from req.body directly
    }));

    console.log("📞 Prepared messages:", messages);

    // Batch size limit (set to 1000 based on API constraint)
    const batchSize = 500;
    const smsResponses = [];

    // Process messages in batches
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      try {
        const batchResponses = await sendSms(tenantId, batch); // Matches sendSms expectation
        smsResponses.push(...batchResponses);
      } catch (batchError) {
        console.error(`Error sending batch ${i / batchSize + 1}:`, batchError);
        smsResponses.push(
          ...batch.map((msg) => ({
            phoneNumber: msg.mobile,
            status: 'error',
            details: batchError.message,
          }))
        );
      }
    }

    // Respond with success message and all SMS responses
    res.status(200).json({
      success: true,
      message: `SMS sent to ${activeCustomers.length} active customers in ${Math.ceil(messages.length / batchSize)} batches.`,
      count: activeCustomers.length,
      smsResponses,
    });
  } catch (error) {
    console.error('Error sending SMS to all customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send SMS to all customers.',
      details: error.message,
    });
  }
};




const sendBill = async (req, res) => {
  const { customerId } = req.body;
  const { tenantId, user } = req.user;

  if (!customerId) {
    return res.status(400).json({ message: 'Customer ID is required.' });
  }

  // Determine current period (YYYY-MM)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth is zero-based

  // Start and end of current month
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  try {
    const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
    const paybill = await getShortCode(tenantId);

    // Fetch customer + latest invoice this month
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, tenantId },
      select: {
        firstName: true,
        phoneNumber: true,
        closingBalance: true,
        invoices: {
          where: {
            invoicePeriod: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
            tenantId,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            invoiceAmount: true,
            createdAt: true,
            InvoiceItem: {
              select: {
                description: true,
                amount: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }


     // Check M-Pesa config for all required credentials
    const mpesaConfig = await prisma.mPESAConfig.findFirst({
      where: { tenantId },
      select: { apiKey: true, passKey: true, secretKey: true },
    });

    // Generate payment link only if all credentials exist
    let linkUrl = '';
    if (mpesaConfig && mpesaConfig.apiKey && mpesaConfig.passKey && mpesaConfig.secretKey) {
      linkUrl = await generatePaymentLink(customerId, tenantId);
    }

    const invoice = customer.invoices[0];
    if (!invoice) {
      return res.status(404).json({ message: `No invoice found for current period (${year}-${String(month).padStart(2, '0')}).` });
    }

    const mobile = sanitizePhoneNumber(customer.phoneNumber);
    if (!mobile) {
      return res.status(400).json({ message: 'No valid phone number available for this customer.' });
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];

    const itemsList = invoice.InvoiceItem.map(item => 
      `${item.description}: KES ${item.amount.toFixed(2)}`
    ).join(', ');

    const message = `Dear ${customer.firstName}, your bill for ${monthName} is ${itemsList}. Total: KES ${invoice.invoiceAmount.toFixed(2)}. Balance: ${
      customer.closingBalance < 0
        ? 'overpayment of KES ' + Math.abs(customer.closingBalance)
        : 'KES ' + customer.closingBalance
    }. Paybill: ${paybill}, Acct: ${mobile}.Click link to pay ${linkUrl} Inquiries? ${customerSupport}`;

    const smsResponses = await sendSMS(tenantId, mobile, message);

    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Bill sent to customer ${customerId}`,
        details: {
          customerId,
          period: `${year}-${String(month).padStart(2, '0')}`,
          invoiceId: invoice.id
        },
        timestamp: new Date(),
      },
    });

    res.status(200).json({
      message: 'Bill sent successfully',
      smsResponses
    });
  } catch (error) {
    console.error('Error sending bill:', error);
    res.status(500).json({ error: 'Failed to send bill.', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
};



// Send bill SMS for customers grouped by collection day
const sendBillPerLandlordOrBuilding = async (req, res) => {
  const { tenantId, user } = req.user;
  const { landlordID, buildingID, period } = req.body;

  try {
    // Input validation
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized: Tenant ID is required' });
    }
    if (!period) {
      return res.status(400).json({ message: 'Missing required field: period is required.' });
    }
    if (!landlordID && !buildingID) {
      return res.status(400).json({ error: 'Either landlordID or buildingID must be provided' });
    }
    if (landlordID && buildingID) {
      return res.status(400).json({ error: 'Provide either landlordID or buildingID, not both' });
    }

    // Validate period format (YYYY-MM)
    const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!periodRegex.test(period)) {
      return res.status(400).json({ message: 'Invalid period format. Use YYYY-MM (e.g., 2025-04).' });
    }

    // Parse period to define the date range for the entire month
    const [year, month] = period.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    if (isNaN(startOfMonth.getTime()) || isNaN(endOfMonth.getTime())) {
      return res.status(400).json({ message: 'Invalid period. Unable to parse date.' });
    }

    // Validate that the period is in the current year (2025)
    const currentYear = new Date().getFullYear();
    if (year !== currentYear) {
      return res.status(400).json({ message: `Period must be in the current year (${currentYear}).` });
    }

    // Convert month number to month name
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];

    console.log(`Fetching invoices from ${startOfMonth} to ${endOfMonth} for ${monthName}`);

    // Fetch SMS config and paybill
    const { customerSupportPhoneNumber: customerSupport } = await getSMSConfigForTenant(tenantId);
    const paybill = await getShortCode(tenantId);

    let customers = [];

    // Case 1: buildingID is provided
    if (buildingID) {
      // Validate building exists and belongs to tenant
      const building = await prisma.building.findFirst({
        where: { id: buildingID, tenantId },
      });
      if (!building) {
        return res.status(404).json({ error: `Building with ID ${buildingID} not found` });
      }

      // Fetch customers in the specified building with their invoices
      customers = await prisma.customer.findMany({
        where: {
          tenantId,
          unit: {
            buildingId: buildingID,
            status: { in: ['OCCUPIED', 'OCCUPIED_PENDING_PAYMENT'] },
          },
          phoneNumber: { not: '' },
        },
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          closingBalance: true,
          invoices: {
            where: {
              invoicePeriod: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
              tenantId,
            },
            select: {
              id: true,
              invoiceAmount: true,
              InvoiceItem: {
                select: {
                  description: true,
                  amount: true,
                },
              },
            },
          },
        },
      });
    }
    // Case 2: Only landlordID is provided
    else if (landlordID) {
      // Validate landlord exists and belongs to tenant
      const landlord = await prisma.landlord.findFirst({
        where: { id: landlordID, tenantId },
      });
      if (!landlord) {
        return res.status(404).json({ error: `Landlord with ID ${landlordID} not found` });
      }

      // Fetch customers in buildings managed by the landlord with their invoices
      customers = await prisma.customer.findMany({
        where: {
          tenantId,
          unit: {
            building: { landlordId: landlordID },
            status: { in: ['OCCUPIED', 'OCCUPIED_PENDING_PAYMENT'] },
          },
          phoneNumber: { not: '' },
        },
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          closingBalance: true,
          invoices: {
            where: {
              invoicePeriod: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
              tenantId,
            },
            select: {
              id: true,
              invoiceAmount: true,
              InvoiceItem: {
                select: {
                  description: true,
                  amount: true,
                },
              },
            },
          },
        },
      });
    }

    // Check if customers were found
    if (customers.length === 0) {
      return res.status(404).json({
        error: `No customers with valid phone numbers found for the specified ${buildingID ? 'building' : 'landlord'}`,
      });
    }

    const messages = [];
    const errors = [];
    const billedCustomerIds = [];

    // Process each customer
    for (const customer of customers) {
      // Skip if no invoice exists for the period
      if (!customer.invoices.length) {
        errors.push({
          customerId: customer.id,
          message: `No invoice found for period ${period}.`,
        });
        continue;
      }

      // Use the first invoice (assuming one invoice per period per customer)
      const invoice = customer.invoices[0];

      // Skip if no valid phone number
      const mobile = sanitizePhoneNumber(customer.phoneNumber);
      if (!mobile || !/^\+?\d{10,15}$/.test(mobile)) {
        errors.push({
          customerId: customer.id,
          message: 'No valid phone number available.',
        });
        continue;
      }

      // Format billed items
      const itemsList = invoice.InvoiceItem.map((item) =>
        `${item.description}: KES ${item.amount.toFixed(2)}`
      ).join(', ');
      const totalAmount = invoice.invoiceAmount;

      // Construct SMS message
      const message = `Dear ${customer.firstName}, your bill for ${monthName} is ${itemsList}. Total: KES ${totalAmount.toFixed(2)}. Balance: ${
        customer.closingBalance < 0
          ? 'overpayment of KES ' + Math.abs(customer.closingBalance)
          : 'KES ' + customer.closingBalance
      }. Paybill: ${paybill}, Acct: ${mobile}. Inquiries? ${customerSupport}`;

      messages.push({ mobile, message });
      billedCustomerIds.push(customer.id);
    }

    if (messages.length === 0) {
      return res.status(400).json({ error: 'No customers with valid phone numbers and invoices found for the specified period' });
    }

    // Send SMS messages
    const smsResponses = await sendSms(tenantId, messages);

    // Log to UserActivity (single entry)
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Bills sent to ${messages.length} customers for ${buildingID ? 'building' : 'landlord'} ${buildingID || landlordID}`,
        details: {
          customerIds: billedCustomerIds,
          period: period,
          [buildingID ? 'buildingID' : 'landlordID']: buildingID || landlordID,
        },
        timestamp: new Date(),
      },
    });

    res.status(200).json({
      message: `Bills sent to ${messages.length} customers`,
      smsResponses,
      errors,
      totalProcessed: customers.length,
      totalMessagesSent: messages.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error('Error sending bills per landlord or building:', error);
    res.status(500).json({ error: 'Failed to send bills.', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
};





const billReminderForAll = async (req, res) => {
  const { tenantId } = req.user;
  const paybill = await getShortCode(tenantId);

  try {
    // Fetch all active customers with a positive closingBalance (exclude overpayments)
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId, // Ensure customer is active and belongs to tenant
        closingBalance: { gt: 0 }, // Only include customers with a positive balance (excludes overpayments)
      },
      select: {
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        monthlyCharge: true,
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers to notify.' });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => ({
      mobile: sanitizePhoneNumber(customer.phoneNumber),
      message: `Dear ${customer.firstName}, you have a balance of KSH ${customer.closingBalance}, settle your bill now to avoid service disruption. Use paybill ${paybill}, account, your phone number`,
    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(tenantId, messages);

    // Respond with success message
    res.status(200).json({ message: 'Bill reminders sent to all customers successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill reminders for all customers:', error);
    res.status(500).json({ error: 'Failed to send bill reminders for all customers.' });
  }
};



const harshBillReminder = async (req, res) => {
    const { tenantId } = req.user; 
    const paybill = await getShortCode(tenantId);
    const { customerSupportPhoneNumber:customerSupport } = await getSMSConfigForTenant(tenantId);
  try {
    // Fetch active customers with a closingBalance greater than 2x their monthlyCharge
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',tenantId, // Only active customers
        closingBalance: { gt: { multiply: prisma.customer.monthlyCharge, factor: 2 } }, // Closing balance > 2x monthly charge
      },
      select: { phoneNumber: true, 

        firstName:true,
        closingBalance:true,
        monthlyCharge:true,
},
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers with significant overdue balances.' });
    }

    // Prepare harsher SMS messages
    const messages = customers.map((customer) => ({
      mobile: sanitizePhoneNumber(customer.phoneNumber),
      message: `Dear ${customer.firstName},Please settle your bill of ${customer.closingBalance}.Immediate action is required to avoid service disruption. Pay via ${paybill}, your phone number is the the account number. Inquiries? ${customerSupport}`,
    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(tenantId,messages);

    // Respond with success message
    res.status(200).json({ message: 'Harsh bill reminders sent to customers with high balances.', smsResponses });
  } catch (error) {
    console.error('Error sending harsh bill reminders:', error);
    res.status(500).json({ error: 'Failed to send harsh bill reminders.' });
  }
};




// Send SMS to a group of customers
const sendToGroup = async (req, res) => {
  const { landlordID, buildingID, message } = req.body;
  const tenantId = req.user?.tenantId;

  // Input validation
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized: Tenant ID is required' });
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required and must be a non-empty string' });
  }
  if (!landlordID && !buildingID) {
    return res.status(400).json({ error: 'Either landlordID or buildingID must be provided' });
  }

  try {
    let customers = [];

    // Case 1: buildingID is provided (prioritized if both are provided)
    if (buildingID) {
      // Validate building exists and belongs to tenant
      const building = await prisma.building.findFirst({
        where: { id: buildingID, tenantId },
      });
      if (!building) {
        return res.status(404).json({ error: `Building with ID ${buildingID} not found` });
      }

      // Fetch customers in the specified building
      customers = await prisma.customer.findMany({
        where: {
          tenantId,
          unit: {
            buildingId: buildingID,
            status: { in: ['OCCUPIED', 'OCCUPIED_PENDING_PAYMENT'] }, // Only occupied units
          },
          phoneNumber: { not: '' }, // Exclude empty phone numbers
        },
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
        },
      });
    }
    // Case 2: Only landlordID is provided
    else if (landlordID) {
      // Validate landlord exists and belongs to tenant
      const landlord = await prisma.landlord.findFirst({
        where: { id: landlordID, tenantId },
      });
      if (!landlord) {
        return res.status(404).json({ error: `Landlord with ID ${landlordID} not found` });
      }

      // Fetch customers in buildings managed by the landlord
      customers = await prisma.customer.findMany({
        where: {
          tenantId,
          unit: {
            building: { landlordId: landlordID },
            status: { in: ['OCCUPIED', 'OCCUPIED_PENDING_PAYMENT'] }, // Only occupied units
          },
          phoneNumber: { not: '' }, // Exclude empty phone numbers
        },
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
        },
      });
    }

    // Check if customers were found
    if (customers.length === 0) {
      return res.status(404).json({
        error: `No customers with valid phone numbers found for the specified ${buildingID ? 'building' : 'landlord'}`,
      });
    }

    // Prepare SMS messages with valid phone numbers
    const messages = customers
      .map((customer) => ({
        mobile: sanitizePhoneNumber(customer.phoneNumber),
        message,
      }))
      .filter((msg) => /^\+?\d{10,15}$/.test(msg.mobile)); // Ensure valid phone number format

    if (messages.length === 0) {
      return res.status(400).json({ error: 'No valid phone numbers found for the selected customers' });
    }

    // Send SMS
    const smsResponses = await sendSms(tenantId, messages);

    // Log the responses for debugging
    console.log('SMS Responses:', smsResponses);

    // Return success response
    res.status(200).json({
      message: `SMS sent to ${messages.length} customers`,
      smsResponses,
    });
  } catch (error) {
    console.error('Error sending SMS to group:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  } finally {
    await prisma.$disconnect();
  }
};





// Helper function to send SMS






const sendSms = async (tenantId, messages) => {
  try {
    const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);

    if (!partnerID || !apikey || !shortCode) {
      throw new Error('Missing SMS configuration for tenant.');
    }

    // Prepare the SMS list for bulk sending
    const smsList = messages.map((msg) => ({
      apikey,
      partnerID,
      message: msg.message,
      shortcode: shortCode,
      mobile: String(msg.mobile),
    }));

    const batchSize = 450; // Adjust based on API limits
    const batches = [];
    for (let i = 0; i < smsList.length; i += batchSize) {
      batches.push(smsList.slice(i, i + batchSize));
    }

    let allResponses = [];

    for (const batch of batches) {
      const payload = {
        smslist: batch, // Use smslist as the key
      };

      console.log("📞 Sending SMS payload:", payload);

      let response;
      try {
        response = await axios.post(process.env.BULK_SMS_ENDPOINT, payload);
        console.log(`Batch of ${batch.length} SMS sent successfully:`, response.data);
      } catch (error) {
        console.error('Bulk SMS API error:', error.response?.data || error.message);
        response = { data: { status: 'FAILED' } }; // Simulate failure response
      }

      // Log each SMS in the batch
      const smsLogs = batch.map((sms) => ({
        clientsmsid: uuidv4(), // Unique ID for logging
        tenantId,
        mobile: sms.mobile,
        message: sms.message,
        status: response.data.status === 'FAILED' ? 'FAILED' : 'SENT',
        createdAt: new Date(),
      }));

      await prisma.sMS.createMany({ data: smsLogs });
      allResponses.push(response.data);
    }

    return allResponses;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error('Failed to send SMS.');
  }
};




  


const sendUnpaidCustomers = async (req, res) => {
  const { tenantId, user } = req.user;

  try {
    // Input validation
    if (!tenantId || !user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Tenant ID or user not found.' });
    }

    // Fetch configurations
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
      select: { customerSupportPhoneNumber: true },
    });
    const mpesaConfig = await prisma.mPESAConfig.findFirst({
      where: { tenantId },
      select: { apiKey: true, passKey: true, secretKey: true },
    });
    const paybill = await getShortCode(tenantId);

    if (!smsConfig) {
      return res.status(400).json({ success: false, message: 'Missing SMS configuration for tenant.' });
    }
    const customerSupport = smsConfig.customerSupportPhoneNumber;

    if (!mpesaConfig || !mpesaConfig.apiKey || !mpesaConfig.passKey || !mpesaConfig.secretKey) {
      console.warn(`M-Pesa configuration incomplete for tenant ${tenantId}. Payment links will not be included.`);
    }

    console.log(`Fetching unpaid customers for tenant ID: ${tenantId}`);

    // Fetch unpaid customers
    const unpaidCustomers = await prisma.customer.findMany({
      where: {
        tenantId,
        phoneNumber: { not: '' },
        status: 'ACTIVE',
        closingBalance: { gt: 0 },
      },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
        closingBalance: true,
        invoices: {
          where: {
            tenantId,
            invoiceAmount: { gt: 0 },
          },
          orderBy: { invoicePeriod: 'desc' },
          take: 1,
          select: {
            id: true,
            invoiceAmount: true,
            InvoiceItem: {
              select: { description: true, amount: true },
            },
          },
        },
      },
    });

    if (unpaidCustomers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No unpaid customers found for the tenant',
      });
    }

    // Determine SMS encoding (for logging purposes)
    const isUCS2 = /[^\u0000-\u007F]/.test(
      unpaidCustomers.map(c => `${c.firstName} ${c.invoices[0]?.InvoiceItem.map(i => i.description).join()}`).join()
    );
    console.log(`Using ${isUCS2 ? 'UCS-2' : 'GSM-7'} encoding (no length limit)`);

    // Process customers with Promise.all (batched for concurrency control)
    const messages = [];
    const errors = [];
    const messagedCustomerIds = [];
    const concurrencyLimit = 10; // Max concurrent generatePaymentLink calls

    // Helper to process customers in chunks
    const processCustomerChunk = async (customers) => {
      const results = await Promise.all(
        customers.map(async (customer) => {
          try {
            if (!customer.invoices.length) {
              return { customerId: customer.id, error: 'No unpaid invoice found.' };
            }

            const invoice = customer.invoices[0];
            const mobile = sanitizePhoneNumber(customer.phoneNumber);
            if (!mobile || !/^\+?\d{10,15}$/.test(mobile)) {
              return { customerId: customer.id, error: 'No valid phone number available.' };
            }

            // Generate payment link
            let linkUrl = '';
            if (mpesaConfig?.apiKey && mpesaConfig?.passKey && mpesaConfig?.secretKey) {
              try {
                linkUrl = await generatePaymentLink(customer.id, tenantId);
              } catch (linkError) {
                console.error(`Failed to generate payment link for customer ${customer.id}:`, linkError);
                return { customerId: customer.id, error: 'Failed to generate payment link.' };
              }
            }

            // Format billed items
            const itemsList = invoice.InvoiceItem.length
              ? invoice.InvoiceItem.map(item => `${item.description}: KES ${item.amount.toFixed(2)}`).join(', ')
              : 'No items specified';
            const totalAmount = invoice.invoiceAmount;

            // Construct SMS message
            const message = `Dear ${customer.firstName}, your outstanding bill is ${itemsList}. Total: KES ${totalAmount.toFixed(2)}. Balance: KES ${customer.closingBalance.toFixed(2)}. Paybill: ${paybill}, Acct: ${mobile}. Pay now: ${linkUrl} Inquiries? ${customerSupport}`;

            return { customerId: customer.id, mobile, message };
          } catch (error) {
            console.error(`Error processing customer ${customer.id}:`, error);
            return { customerId: customer.id, error: error.message };
          }
        })
      );
      return results;
    };

    // Process customers in chunks
    for (let i = 0; i < unpaidCustomers.length; i += concurrencyLimit) {
      const chunk = unpaidCustomers.slice(i, i + concurrencyLimit);
      const chunkResults = await processCustomerChunk(chunk);

      chunkResults.forEach(result => {
        if (result.error) {
          errors.push({ customerId: result.customerId, message: result.error });
        } else {
          messages.push({ mobile: result.mobile, message: result.message });
          messagedCustomerIds.push(result.customerId);
        }
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unpaid customers with valid phone numbers and invoices found',
        errors,
      });
    }

    // Send SMS in batches
    const batchSize = 500;
    const smsResponses = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      try {
        const batchResponses = await sendSms(tenantId, batch);
        smsResponses.push(...batchResponses);
      } catch (batchError) {
        console.error(`Error sending batch ${i / batchSize + 1}:`, batchError);
        smsResponses.push(
          ...batch.map(msg => ({
            phoneNumber: msg.mobile,
            status: 'error',
            details: batchError.message,
          }))
        );
      }
    }

    // Log to UserActivity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Unpaid reminders sent to ${messages.length} customers`,
        details: {
          customerIds: messagedCustomerIds,
          encoding: isUCS2 ? 'UCS-2' : 'GSM-7',
        },
        timestamp: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: `SMS sent to ${messages.length} unpaid customers successfully`,
      smsResponses,
      errors,
      totalProcessed: unpaidCustomers.length,
      totalMessagesSent: messages.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error('Error in sendUnpaidCustomers:', {
      tenantId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to send reminders to unpaid customers',
      details: error.message,
    });
  }
};
  
const sendCustomersAboveBalance = async (req, res) => {
  const { tenantId, user } = req.user;
  const { balance } = req.body;

  try {
    // Input validation
    if (!tenantId || !user) {
      throw new Error('Unauthorized: Tenant ID or user not found.');
    }
    if (balance === undefined || isNaN(balance) || balance < 0) {
      throw new Error('A valid balance amount is required');
    }

    // Fetch configurations
    const smsConfig = await prisma.sMSConfig.findUnique({
      where: { tenantId },
      select: { customerSupportPhoneNumber: true },
    });
    const mpesaConfig = await prisma.mPESAConfig.findFirst({
      where: { tenantId },
      select: { apiKey: true, passKey: true, secretKey: true },
    });
    const paybill = await getShortCode(tenantId);

    if (!smsConfig) {
      throw new Error('Missing SMS configuration for tenant.');
    }
    const customerSupport = smsConfig.customerSupportPhoneNumber;

    if (!mpesaConfig || !mpesaConfig.apiKey || !mpesaConfig.passKey || !mpesaConfig.secretKey) {
      console.warn(`M-Pesa configuration incomplete for tenant ${tenantId}. Payment links will not be included.`);
    }

    console.log(`Fetching customers above balance ${balance} for tenant ID: ${tenantId}`);

    // Fetch active customers
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE', tenantId },
      select: { id: true, phoneNumber: true, firstName: true, closingBalance: true },
    });

    // Filter customers above balance
    const customersAboveBalance = activeCustomers.filter(
      (customer) => customer.closingBalance > balance
    );

    if (customersAboveBalance.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No customers found with balance above ${balance}.`,
      });
    }

    // Determine SMS encoding (for logging purposes)
    const isUCS2 = /[^\u0000-\u007F]/.test(customersAboveBalance.map(c => c.firstName).join());
    console.log(`Using ${isUCS2 ? 'UCS-2' : 'GSM-7'} encoding (no length limit)`);

    // Process customers with Promise.all (batched for concurrency control)
    const messages = [];
    const errors = [];
    const messagedCustomerIds = [];
    const concurrencyLimit = 10; // Max concurrent generatePaymentLink calls

    // Helper to process customers in chunks
    const processCustomerChunk = async (customers) => {
      const results = await Promise.all(
        customers.map(async (customer) => {
          try {
            const mobile = sanitizePhoneNumber(customer.phoneNumber);
            if (!mobile || !/^\+?\d{10,15}$/.test(mobile)) {
              return { customerId: customer.id, error: 'No valid phone number available.' };
            }

            // Generate payment link
            let linkUrl = '';
            if (mpesaConfig?.apiKey && mpesaConfig?.passKey && mpesaConfig?.secretKey) {
              try {
                linkUrl = await generatePaymentLink(customer.id, tenantId);
              } catch (linkError) {
                console.error(`Failed to generate payment link for customer ${customer.id}:`, linkError);
                return { customerId: customer.id, error: 'Failed to generate payment link.' };
              }
            }

            // Construct SMS message
            const message = `Dear ${customer.firstName}, you have a pending balance of KES ${customer.closingBalance.toFixed(2)}. Paybill: ${paybill}, Acct: ${mobile}. Pay now: ${linkUrl} Inquiries? ${customerSupport}. Pay now to avoid service disruption.`;

            return { customerId: customer.id, mobile, message };
          } catch (error) {
            console.error(`Error processing customer ${customer.id}:`, error);
            return { customerId: customer.id, error: error.message };
          }
        })
      );
      return results;
    };

    // Process customers in chunks
    for (let i = 0; i < customersAboveBalance.length; i += concurrencyLimit) {
      const chunk = customersAboveBalance.slice(i, i + concurrencyLimit);
      const chunkResults = await processCustomerChunk(chunk);

      chunkResults.forEach(result => {
        if (result.error) {
          errors.push({ customerId: result.customerId, message: result.error });
        } else {
          messages.push({ mobile: result.mobile, message: result.message });
          messagedCustomerIds.push(result.customerId);
        }
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No customers with valid phone numbers found',
        errors,
      });
    }

    // Send SMS in batches
    const batchSize = 500;
    const smsResponses = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      try {
        const batchResponses = await sendSms(tenantId, batch);
        smsResponses.push(...batchResponses);
      } catch (batchError) {
        console.error(`Error sending batch ${i / batchSize + 1}:`, batchError);
        smsResponses.push(
          ...batch.map(msg => ({
            phoneNumber: msg.mobile,
            status: 'error',
            details: batchError.message,
          }))
        );
      }
    }

    // Log to UserActivity
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user } },
        tenant: { connect: { id: tenantId } },
        action: `Balance reminders sent to ${messages.length} customers above ${balance}`,
        details: {
          customerIds: messagedCustomerIds,
          balanceThreshold: balance,
          encoding: isUCS2 ? 'UCS-2' : 'GSM-7',
        },
        timestamp: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: `SMS sent to ${messages.length} customers with balance above ${balance} successfully`,
      smsResponses,
      errors,
      totalProcessed: customersAboveBalance.length,
      totalMessagesSent: messages.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error('Error in sendCustomersAboveBalance:', {
      tenantId,
      balance,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to send reminders to customers above balance',
      details: error.message,
    });
  }
};
  
  


  

      
  
  
  

module.exports = {
  sendBills,
  sendToAll,
  sendBill,


  sendBillPerLandlordOrBuilding,
  sendToGroup,
  sendSMS,
  sendSms,
  sendToOne,


  checkSmsBalance,
  getSmsBalance,
  sendUnpaidCustomers,




 sendCustomersAboveBalance,

  sendCustomSmsAboveBalance,
  getShortCode
};