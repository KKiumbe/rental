// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createBuilding, searchBuildings, createUnit } = require('../../controller/building/building.js');




const router = express.Router();


router.post('/building', verifyToken ,createBuilding);

router.post('/create-unit', verifyToken ,createUnit);

router.get('/buildings/search', searchBuildings);
 



module.exports = router;

