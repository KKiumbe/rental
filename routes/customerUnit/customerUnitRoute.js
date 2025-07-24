// routes/customerRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { assignUnitToCustomer, getCustomerUnits } = require('../../controller/customerUnit/assignUnit.js');



const   router = express.Router();

// Route to create a new customer


// assignUnitToCustomer, getCustomerUnits 

router.post('/assign-unit-to-customer',verifyToken, assignUnitToCustomer);
router.get('/get-all-customer-units/:id',verifyToken, getCustomerUnits);

module.exports = router;

