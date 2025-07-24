// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createBuilding, searchBuildings, createUnit, getAllBuildings, getBuildingById, editBuilding, getUnitsByBuilding, getUnitDetailsById, editUnit ,getUnitDetails} = require('../../controller/building/building.js');

//const { createBuilding, searchBuildings } = require('../../controller/building/building.js');




const router = express.Router();






router.post('/building', verifyToken ,createBuilding);

router.get('/buildings/:buildingId',verifyToken, getBuildingById);
router.get('/buildings/search', searchBuildings);

router.get('/buildings', verifyToken, getAllBuildings);
 
//units route
router.get('/units/:unitId', verifyToken, getUnitDetails);

//router.put('/units/:unitId', verifyToken, editUnit);


module.exports = router;

