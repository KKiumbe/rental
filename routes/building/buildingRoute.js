// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createBuilding, searchBuildings } = require('../../controller/building/building.js');




const router = express.Router();



<<<<<<< HEAD


router.post('/building', verifyToken ,createBuilding);

=======
>>>>>>> 27b0c48 (Revert "WIP: saving my changes before revert")
router.get('/buildings/search', searchBuildings);
 



module.exports = router;

