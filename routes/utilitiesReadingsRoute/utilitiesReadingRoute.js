

const express = require('express');

const verifyToken = require('../../middleware/verifyToken.js');
const { createWaterReading, createGasReading, getAllAbnormalWaterReadings, getAllWaterReadings, reviewAbnormalWaterReading, resolveAbnormalWaterReading, manualUpdateMeterReading, getWaterReadingsByCustomer 

, searchWaterReadingsByPhone, searchAbnormalWaterReadingsByPhone, searchWaterReadingsByName, searchAbnormalWaterReadingsByName,
getMeterReadingDetails,
getAbnormalReadingDetails,
getNormalReadingDetails
} = require('../../controller/utilitiesReadings/utilitiesReadings.js');



const router = express.Router();



router.post('/water-reading', verifyToken, createWaterReading);

router.get('/abnormal-water-readings', verifyToken, getAllAbnormalWaterReadings);

router.get('/water-readings', verifyToken, getAllWaterReadings);

//review and resolve abnormal water readings
router.post('/abnormal-water-reading/:id/review', verifyToken, reviewAbnormalWaterReading)

//resolve abnormal water reading
router.post('/abnormal-water-reading/:id/resolve', verifyToken, resolveAbnormalWaterReading)

router.get("/water-readings/customer", verifyToken, getWaterReadingsByCustomer);

//manual update meter reading
router.post('/manual-update-meter-reading', verifyToken, manualUpdateMeterReading);

router.post('/gas-reading', verifyToken, createGasReading);

//search 



// GET /api/water-readings/search-by-phone
router.get('/water-readings/search-by-phone', verifyToken, searchWaterReadingsByPhone);

// GET /api/abnormal-water-readings/search-by-phone
router.get('/abnormal-water-readings/search-by-phone', verifyToken, searchAbnormalWaterReadingsByPhone);

// GET /api/water-readings/search-by-name
router.get('/water-readings/search-by-name', verifyToken, searchWaterReadingsByName);

// GET /api/abnormal-water-readings/search-by-name
router.get('/abnormal-water-readings/search-by-name', verifyToken, searchAbnormalWaterReadingsByName);

router.get('/meter-reading/normal/:id', verifyToken, getNormalReadingDetails);
router.get('/meter-reading/abnormal/:id', verifyToken, getAbnormalReadingDetails);



module.exports = router;
