

const express = require('express');

const verifyToken = require('../../middleware/verifyToken.js');
const { createWaterReading, createGasReading } = require('../../controller/utilitiesReadings/utilitiesReadings.js');



const router = express.Router();



router.post('/water-reading', verifyToken, createWaterReading);

router.post('/gas-reading', verifyToken, createGasReading);



module.exports = router;
