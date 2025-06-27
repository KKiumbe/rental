// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createBuilding, searchBuildings } = require('../../controller/building/building.js');




const router = express.Router();





router.post('/building', verifyToken ,createBuilding);

router.get('/buildings/search', searchBuildings);
 



module.exports = router;

