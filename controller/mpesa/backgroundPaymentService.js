const cron = require('node-cron');
const { settleInvoice } = require('./paymentSettlement.js');

// Step 1: Schedule the background service to run periodically (e.g., every minute)
cron.schedule('* * * * *', async () => {
    console.log('Checking and processing unprocessed Mpesa transactions...');
    await settleInvoice();
});
