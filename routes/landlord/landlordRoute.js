

const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createLandlord, getBuildingsByLandlord, getAllLandlords, getLandlordDetails, editLandlord } = require('../../controller/landlord/landlord.js');



const router = express.Router();

// Update Tenant Details


router.post('/landlord', verifyToken, createLandlord);
router.get('/landlords', verifyToken, getAllLandlords);

// Old (this only returns buildings, not full landlord)
router.get('/landlord/:id', verifyToken, getLandlordDetails);

router.put('/landlord/:id', verifyToken, editLandlord);



module.exports = router;

