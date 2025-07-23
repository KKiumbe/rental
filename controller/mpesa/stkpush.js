

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { settleInvoice } = require('./paymentSettlement');
const axios = require('axios');
const crypto = require('crypto');


const { getTenantSettingSTK } = require('./mpesaConfig');
const { getAccessToken } = require('./token');
require('dotenv').config();


async function generatePaymentLink(customerId, tenantId) {
  if (!process.env.APP_URL) {
    throw new Error('APP_URL environment variable is not set');
  }

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1); // expires in 2 months

  let token;
  let record;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    token = crypto.randomBytes(4).toString('hex'); // e.g. "9f8d7a3b"
    try {
      record = await prisma.paymentLink.create({
        data: { token, tenantId, customerId, expiresAt }
      });
      break;
    } catch (err) {
      // Prisma unique violation code
      if (err.code === 'P2002' && attempt < maxAttempts) {
        // collision: retry generating token
        console.warn(`Token collision on generatePaymentLink, retrying (attempt ${attempt})`);
        continue;
      }
      throw err;
    }
  }
  if (!record) {
    throw new Error('Failed to generate unique payment link token');
  }
  return `${process.env.APP_URL}/api/pay/${token}`;
}






async function renderPayPage(req, res, next) {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).send('Payment token is required');
    }

    const link = await prisma.paymentLink.findUnique({
      where: { token },
      include: {
        customer: {
          select: {
            id: true,
            phoneNumber: true,
            closingBalance: true,
            firstName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!link || link.expiresAt < new Date()) {
      return res.status(404).send('Payment link expired or invalid');
    }

    if (!link.customer || !link.customer.phoneNumber || !link.customer.id) {
      return res.status(400).send('Invalid customer data');
    }

    if (!link.tenant || !link.tenant.name) {
      return res.status(400).send('Invalid tenant data');
    }

    const defaultAmount = link.customer.closingBalance || 0;
    const amount = Number(defaultAmount).toFixed(2);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).send('Invalid balance');
    }

    const apiBaseUrl = process.env.APP_URL || 'http://localhost:5000';

    const sanitizeHtml = require('sanitize-html');
    const sanitizedPhone = sanitizeHtml(link.customer.phoneNumber);
    const sanitizedToken = sanitizeHtml(link.token);
    const sanitizedFirstName = sanitizeHtml(link.customer.firstName || 'Customer');
    const sanitizedTenantName = sanitizeHtml(link.tenant.name);

    res.set('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <meta name="theme-color" content="#28a745" />
          <title>Pay ${sanitizedTenantName}</title>
          <style>
            :root {
              --primary: #28a745;
              --primary-dark: #218838;
              --danger: #dc3545;
              --danger-dark: #c82333;
              --text: #333;
              --text-light: #666;
              --bg: #f5f5f5;
              --card-bg: #fff;
              --border: #ccc;
            }
            @media (prefers-color-scheme: dark) {
              :root {
                --text: #ddd;
                --text-light: #aaa;
                --bg: #1a1a1a;
                --card-bg: #2a2a2a;
                --border: #444;
              }
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              height: 100%;
              width: 100%;
              background: var(--bg);
              color: var(--text);
              font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
              font-size: 18px;
              display: flex;
              justify-content: center;
              align-items: center;
              overflow: hidden;
            }
            .card {
              width: 96vw;
              max-width: 550px;
              max-height: 92vh;
              background: var(--card-bg);
              border-radius: 24px;
              box-shadow: 0 6px 20px rgba(0,0,0,0.1);
              padding: 28px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow-y: auto;
            }
            .header {
              text-align: center;
              margin-bottom: 16px;
            }
            h1 {
              font-size: 2rem;
              font-weight: 700;
              margin-bottom: 10px;
            }
            .message {
              font-size: 1rem;
              color: var(--primary);
              font-style: italic;
              margin-bottom: 12px;
            }
            .balance {
              font-size: 1rem;
              color: var(--text-light);
              margin-bottom: 10px;
              text-align: center;
            }
            .hint {
              font-size: 0.95rem;
              color: var(--text-light);
              margin-top: 4px;
              text-align: center;
              display: block;
            }
            .input-group {
              margin-bottom: 16px;
            }
            label {
              font-size: 1rem;
              font-weight: 600;
              display: block;
              margin-bottom: 6px;
            }
            input {
              width: 100%;
              padding: 14px;
              font-size: 1.25rem;
              border: 1px solid var(--border);
              border-radius: 10px;
              background: var(--card-bg);
              color: var(--text);
              outline: none;
            }
            input:focus {
              border-color: var(--primary);
              box-shadow: 0 0 0 3px rgba(40,167,69,0.1);
            }
            .error {
              font-size: 0.875rem;
              color: var(--danger);
              margin-top: 6px;
              display: none;
            }
            .error.show {
              display: block;
            }
            .button-group {
              display: flex;
              flex-direction: column;
              gap: 12px;
              margin-top: 12px;
            }
            button {
              background: var(--primary);
              color: white;
              border: none;
              border-radius: 10px;
              padding: 16px;
              font-size: 1.125rem;
              font-weight: 600;
              cursor: pointer;
            }
            button:hover {
              background: var(--primary-dark);
            }
            button:active {
              transform: scale(0.98);
            }
            button.cancel-btn {
              background: var(--danger);
            }
            button.cancel-btn:hover {
              background: var(--danger-dark);
            }
            .status {
              margin-top: 12px;
              font-size: 1rem;
              min-height: 1.25rem;
              color: var(--text-light);
              text-align: center;
            }
            .success {
              color: var(--primary);
            }
            .error {
              color: var(--danger);
            }
            .loader {
              display: none;
              margin: 12px auto;
              border: 3px solid #e0e0e0;
              border-top: 3px solid var(--primary);
              border-radius: 50%;
              width: 30px;
              height: 30px;
              animation: spin 1s linear infinite;
            }
            .loader.show {
              display: block;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @media (max-height: 600px) {
              html, body {
                font-size: 16px;
              }
              .card {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Pay ${sanitizedTenantName}</h1>
              <div class="message">Paying for garbage collection helps make our world cleaner and greener!</div>
            </div>
            <div class="content">
              <div class="balance">
                Balance: KES ${amount}
                <span class="hint">Don’t have the full amount? You can edit the amount to pay.</span>
              </div>
              <form id="payment-form" data-phone="${sanitizedPhone}" data-token="${sanitizedToken}" data-api-url="${apiBaseUrl}" data-first-name="${sanitizedFirstName}" class="input-group" novalidate>
                <label for="amount">Amount (KES)</label>
                <input type="number" id="amount" value="${amount}" min="1" max="150000" step="0.01" required aria-describedby="amount-error" inputmode="decimal" />
                <div id="amount-error" class="error" role="alert"></div>
              </form>
              <div id="loader" class="loader"></div>
              <p id="status" class="status" role="status"></p>
            </div>
            <div class="footer">
              <div class="button-group">
                <button id="pay" type="submit" form="payment-form">Pay Now</button>
                <button id="cancel" class="cancel-btn" type="button">Cancel</button>
              </div>
            </div>
          </div>
          <script defer src="/scripts/payment.js"></script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(`Error rendering pay page for token ${req.params.token}:`, err.message);
    res.status(500).send('An error occurred while loading the payment page');
  }
}







async function stkPush(req, res, next) {
  try {
    const { amount, phoneNumber, accountReference: token, transactionDesc } = req.body;

    // Validate amount
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    const integerAmount = Math.floor(parsedAmount);
    if (integerAmount < 1) {
      return res.status(400).json({ error: 'Amount must be at least 1' });
    }

    const link = await prisma.paymentLink.findUnique({
      where: { token },
      select: { tenantId: true, expiresAt: true, paid: true }
    });
    if (!link) {
      return res.status(400).json({ error: 'Invalid payment link token' });
    }
    if (link.expiresAt < new Date() || link.paid) {
      return res.status(400).json({ error: 'Payment link expired or already used' });
    }

    const tenantId = link.tenantId;

    const { shortCode, passKey } = await getTenantSettingSTK(tenantId);
    console.log({ shortCode, passKey });

    if (!shortCode || !passKey) {
      return res.status(400).json({ error: 'MPESA configuration not found for this tenant' });
    }

    const accessToken = await getAccessToken(tenantId);

    console.log(`initiating STK Push for token ${token} with amount ${integerAmount} to phone ${phoneNumber}`);

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const password = Buffer.from(shortCode + passKey + timestamp).toString('base64');

    // Format phone number for AccountReference (remove leading 0, add 254)
    const formattedPhoneNumber = phoneNumber.replace(/^0/, '254');
    
    // Ensure AccountReference is 12 characters or less (if required by your paybill)
    const accountReference = formattedPhoneNumber.slice(-12); // Use last 12 digits of phone number

    const payload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: integerAmount,
      PartyA: formattedPhoneNumber,
      PartyB: shortCode,
      PhoneNumber: formattedPhoneNumber,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountReference, // Use phone number as AccountReference
      TransactionDesc: transactionDesc
    };

    console.log(`M-Pesa URL: ${process.env.MPESA_URL}/mpesa/stkpush/v1/processrequest`);
    try {
      const response = await axios.post(
        `${process.env.MPESA_URL}/mpesa/stkpush/v1/processrequest`,
        payload,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      console.log('STK Push HTTP status:', response.status);
      console.log('STK Push response headers:', response.headers);
      console.log('STK Push response body:', JSON.stringify(response.data, null, 2));

      const data = response.data;

      await prisma.paymentLink.update({
        where: { token },
        data: {
          merchantRequestId: data.MerchantRequestID,
          checkoutRequestId: data.CheckoutRequestID
        }
      });

      res.json(data);
    } catch (axiosError) {
      console.error('Axios error details:', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
        url: `${process.env.MPESA_URL}/mpesa/stkpush/v1/processrequest`
      });
      throw axiosError;
    }
  } catch (err) {
    console.error('STK Push error:', err.message);
    res.status(500).json({ error: 'Failed to initiate STK Push' });
  }
}

async function stkCallback(req, res) {
  res.status(200).end();
  try {
    console.log('STK Callback Request Body:', JSON.stringify(req.body, null, 2));
    const cb = req.body.Body?.stkCallback;
    if (!cb) return console.log('No stkCallback in body');
    if (cb.ResultCode !== 0) {
      return console.log(`STK Callback failed: ${cb.ResultCode} – ${cb.ResultDesc}`);
    }
    const checkoutRequestId = cb.CheckoutRequestID;

    // Mark link as paid and expire
    await prisma.paymentLink.update({
      where: { checkoutRequestId },
      data: { expiresAt: new Date(), paid: true }
    });

    // Re-fetch link for customer and config
    const link = await prisma.paymentLink.findUnique({
      where: { checkoutRequestId },
      include: {
        customer: { select: { firstName: true, phoneNumber: true } },
        tenant:   {
          select: { mpesaConfig: { select: { shortCode: true } } }
        }
      }
    });
    if (!link) return console.error(`No link for CheckoutRequestID ${checkoutRequestId}`);

    const items = cb.CallbackMetadata?.Item || [];
    const amount  = items.find(i => i.Name === 'Amount')?.Value;
    const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const msisdn   = items.find(i => i.Name === 'PhoneNumber')?.Value;
    const txDate  = items.find(i => i.Name === 'TransactionDate')?.Value;

    // Avoid duplicate TransID errors
    const existing = await prisma.mPESATransactions.findUnique({ where: { TransID: receipt } });
    if (existing) {
      console.log(`Duplicate transaction ${receipt}. Skipping creation.`);
      return;
    }

    // Parse transaction timestamp
    const dt = String(txDate);
    const transTime = new Date(
      `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}T${dt.slice(8,10)}:${dt.slice(10,12)}:${dt.slice(12,14)}Z`
    );

       // Convert to local format (07 or 01)
    let localPhone = String(msisdn);
    if (localPhone.startsWith('254') && localPhone.length === 12) {
      localPhone = '0' + localPhone.slice(3);
    }
    if (!/^0(7|1)\d{8}$/.test(localPhone)) {
      console.error(`Invalid BillRefNumber format: ${localPhone}`);
      return;
    }

    // Store transaction
    await prisma.mPESATransactions.create({ data: {
      BillRefNumber: localPhone,
      TransAmount:   parseFloat(amount),
      FirstName:     link.customer.firstName || 'Unknown',
      MSISDN:        msisdn.toString(),
      TransID:       receipt,
      TransTime:     transTime,
      processed:     false,
      tenantId:      link.tenant.mpesaConfig?.shortCode ? link.tenantId : link.tenantId,
      ShortCode:     link.tenant.mpesaConfig?.shortCode
    }});

    // Call settlement
    await settleInvoice();
    console.log(`Processed STK Callback for ${checkoutRequestId}`);
  } catch (err) {
    console.error('STK Callback error:', err.message);
  }
}



async function checkPaymentStatus(req, res) {
  const { checkoutRequestId } = req.params;

  const link = await prisma.paymentLink.findUnique({
    where: { checkoutRequestId },
    select: { paid: true }
  });

  if (!link) {
    return res.status(404).json({ error: 'Payment link not found' });
  }

  if (link.paid) {
    return res.json({ status: 'completed' });
  } else if (link.expiresAt < new Date()) {
    return res.json({ status: 'failed' });
  } else {
    return res.json({ status: 'pending' });
  }
}







module.exports = {
  generatePaymentLink,
  renderPayPage,
  stkPush,
  stkCallback,checkPaymentStatus
}
