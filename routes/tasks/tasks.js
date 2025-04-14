
const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { createTaskForIssuingTrashBags } = require('../../controller/tasks/createBagIssuanceTask.js');
const { fetchMyTasks, fetchTaskDetails } = require('../../controller/tasks/fetchTasks.js');

const {markCustomerAsIssued} = require('../../controller/tasks/issueBags.js');
const { updateTaskStatus } = require('../../controller/tasks/updateTask.js');








const router = express.Router();

// Route to create a new customer
router.post('/create-trashbag-task', verifyToken, checkAccess('trashBagIssuance', 'create'),  createTaskForIssuingTrashBags);

router.get('/fetch-task/',verifyToken, checkAccess('trashBagIssuance', 'read'), fetchMyTasks);

router.get('/fetch-task-details/:taskId',verifyToken, checkAccess('trashBagIssuance', 'read'), fetchTaskDetails);


router.post('/trashbag-issed/:taskId',verifyToken, checkAccess('trashBagIssuance', 'update'), markCustomerAsIssued);

router.post('/update-task/:taskId',verifyToken, checkAccess('trashBagIssuance', 'update'), updateTaskStatus);






module.exports = router;

