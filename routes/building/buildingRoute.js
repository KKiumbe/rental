// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createBuilding, searchBuildings, createUnit, getAllBuildings, getBuildingById, editBuilding, getUnitsByBuilding, getUnitDetailsById, editUnit } = require('../../controller/building/building.js');

//const { createBuilding, searchBuildings } = require('../../controller/building/building.js');




const router = express.Router();






router.post('/building', verifyToken ,createBuilding);


router.get('/buildings/search', searchBuildings);

router.get('/buildings', verifyToken, getAllBuildings);
 
//units route
//router.get('/units/:unitId', verifyToken, getUnitDetailsById);

//router.put('/units/:unitId', verifyToken, editUnit);


module.exports = router;

