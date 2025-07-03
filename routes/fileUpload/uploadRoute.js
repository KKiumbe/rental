const express = require('express');
const { upload, uploadCustomers, uploadLease, downloadLease, uploadLandlord, uploadCustomersWithBuilding } = require('../../controller/fileupload/uploadscript.js');
const verifyToken = require('../../middleware/verifyToken.js');
const path = require('path');
const router = express.Router();

// Route for uploading customer data
router.post('/upload-customers', upload.single('file'), verifyToken, uploadCustomers);

router.post('/upload-customers-withbuildingId', upload.single('file'), verifyToken, uploadCustomersWithBuilding);


router.post('/upload-landlords', upload.single('file'), verifyToken, uploadLandlord);

router.post('/upload-lease', upload.single('leaseFile'),verifyToken, uploadLease);
router.get('/download-lease/:id',verifyToken, downloadLease);
//router.post('/update-customers', upload.single('file'), verifyToken, updateCustomersClosingBalance);
//router.post('/update-customers-locality', upload.single('file'),verifyToken, updateCustomersDetails);


// Export the router to use in your main app




router.get('/templates/customers.csv', verifyToken, (req, res) => {
  const filePath = path.join(__dirname, '../../templates/customers.csv');
  res.download(filePath, 'customers.csv', (err) => {
    if (err) {
      console.error('Error serving template:', err);
      res.status(404).json({ success: false, message: 'Template file not found' });
    }
  });
});


module.exports = router;
   