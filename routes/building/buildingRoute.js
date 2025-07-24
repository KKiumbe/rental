// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createBuilding, searchBuildings, createUnit, getAllBuildings, getBuildingById, editBuilding, getUnitsByBuilding, getUnitDetailsById, editUnit ,getUnitDetails} = require('../../controller/building/building.js');
const { getUnitCustomers } = require('../../controller/customers/editCustomer.js');

//const { createBuilding, searchBuildings } = require('../../controller/building/building.js');




const router = express.Router();






router.post('/building', verifyToken ,createBuilding);

router.get('/buildings/:buildingId',verifyToken, getBuildingById);
router.get('/buildings/search', searchBuildings);

router.get('/buildings', verifyToken, getAllBuildings);
router.put('/buildings/:buildingId', verifyToken, editBuilding);
 
//units route
router.get('/units/:unitId', verifyToken, getUnitDetails);

router.post('/create-unit', verifyToken, createUnit);

router.put('/units/:unitId', verifyToken, editUnit);

router.get('/units/:id/customers', verifyToken, getUnitCustomers);
router.get('/building-units/:buildingId', verifyToken, getUnitsByBuilding);
//router.get('/units/:unitId', verifyToken, getUnitDetailsById);

//router.put('/units/:unitId', verifyToken, editUnit);



module.exports = router;

