

const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createLandlord, getBuildingsByLandlord, getAllLandlords, getLandlordById } = require('../../controller/landlord/landlord.js');



const router = express.Router();

// Update Tenant Details


router.post('/landlord', verifyToken, createLandlord);

router.get('/landlord/:id',verifyToken, getLandlordById);

router.get('/landlords',verifyToken, getAllLandlords);

router.get('/landlord/:landlordId/buildings',verifyToken, getBuildingsByLandlord);




module.exports = router;

