const { smsQueue } = require('../bill/jobFunction');
const { generateBulkBillSmsMessage } = require('./sendSMS.js');

// Express request handler to add the SMS job to the queue
const addSmsJob = async (req, res) => {
  try {
    // Add the bulk SMS job to the queue
    await smsQueue.add('bulkSmsJob', {});

    // Send a response indicating the job was successfully added
    return res.status(200).json({ message: 'Bulk SMS job added to the queue successfully.' });
  } catch (error) {
    console.error('Error adding SMS job to the queue:', error);
    return res.status(500).json({ error: 'Failed to add SMS job to the queue.' });
  }
};

// Function that gets called by Bull to process the job
smsQueue.process('bulkSmsJob', async (job, done) => {
  try {
    await generateBulkBillSmsMessage(); // Call the function to send SMS
    done(); // Mark the job as complete
  } catch (error) {
    console.error('Error processing bulk SMS job:', error);
    done(error); // Pass the error to Bull
  }
});

module.exports = { addSmsJob };
