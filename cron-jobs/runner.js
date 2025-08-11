const cron = require('node-cron');
const { runTask } = require('../controller/jobs/backup');


cron.schedule('0 2 * * *', () => {
  console.log(`[ ⏰ Triggering backup task at: ${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}`);
  runTask();
}, {
  scheduled: true,
  timezone: 'Africa/Nairobi',
});



