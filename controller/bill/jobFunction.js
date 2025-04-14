const Queue = require('bull');



const invoiceQueue = new Queue('invoiceQueue', {
    redis: {
      host: '127.0.0.1', // Adjust if necessary
      port: 6379,
    },
  });

// Queue for bulk SMS jobs
const smsQueue = new Queue('smsQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

module.exports = {
  invoiceQueue,
  smsQueue,
};
