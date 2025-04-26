// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createBuilding, searchBuildings, createUnit, getAllBuildings, getBuildingById, editBuilding } = require('../../controller/building/building.js');




const router = express.Router();





router.post('/building', verifyToken ,createBuilding);
router.get('/buildings', verifyToken ,getAllBuildings);

//router.get('/units/:buildingId', verifyToken ,getAllBuildings);

router.get('/buildings/:buildingId', verifyToken ,getBuildingById);

router.put('/buildings/:buildingId', verifyToken, editBuilding);


router.post('/create-unit', verifyToken ,createUnit);

router.get('/buildings/search', searchBuildings);
 



module.exports = router;

