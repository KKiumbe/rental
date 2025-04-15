// routes/customerRoutes.js
const express = require('express');
const { createCustomer } = require('../../controller/customers/createCustomer.js');
const { getAllCustomers } = require('../../controller/customers/getAllCustomers.js');
const { editCustomer } = require('../../controller/customers/editCustomer.js');
const { SearchCustomers, SearchCustomersByPhoneNumber, SearchCustomersByName } = require('../../controller/customers/searchCustomers.js');
const checkAccess = require('../../middleware/roleVerify.js');
const verifyToken = require('../../middleware/verifyToken.js');
const { getCustomerDetails, deleteCustomer } = require('../../controller/customers/customerDetails.js');
const { clearCustomerData } = require('../../controller/customers/delete/delete.js');



const   router = express.Router();

// Route to create a new customer
router.post(
    '/customers',verifyToken, checkAccess('customer','create'),
 
    createCustomer // Step 3: Proceed to the controller if authorized
);
router.get('/customers', verifyToken, checkAccess('customer','read') ,getAllCustomers);
router.put('/customers/:id',verifyToken,checkAccess('customer','update'), editCustomer);
router.get('/search-customers',verifyToken, SearchCustomers);
router.delete('/customers/:id',verifyToken,checkAccess('customer','delete'), deleteCustomer);

router.get('/search-customer-by-phone',verifyToken, SearchCustomersByPhoneNumber);

router.get('/search-customer-by-name',verifyToken, SearchCustomersByName
);
router.get('/customer-details/:id',verifyToken, getCustomerDetails);
router.post('/delete-customers',clearCustomerData)  



module.exports = router;

