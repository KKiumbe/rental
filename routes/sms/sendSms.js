const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { sendBills, sendToAll, sendBill, sendBillPerDay, sendToGroup, sendToOne, sendUnpaidCustomers, sendLowBalanceCustomers, sendHighBalanceCustomers, sendCustomersAboveBalance, sendBillsEstate, sendToEstate } = require('../../controller/sms/sms.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { updateSMSConfig, createSMSConfig } = require('../../controller/smsConfig/smsConfig.js');
const { updateSmsDeliveryStatus, getSmsMessages } = require('../../controller/bulkSMS/deliveryStatus.js');






const router = express.Router();

// SMS Routes
router.post('/send-bills', verifyToken, checkAccess('customer', 'read'), sendBills);//done

router.post('/send-bills-per-estate', verifyToken, checkAccess('customer', 'read'), sendBillsEstate);//done
router.post('/send-to-all', verifyToken, checkAccess('customer', 'read'), sendToAll);//done
router.post('/send-to-estate', verifyToken, checkAccess('customer', 'read'), sendToEstate);//done

router.post('/send-bill', verifyToken, checkAccess('customer', 'read'), sendBill);//done
router.post('/send-bill-perday', verifyToken, checkAccess('customer', 'read'), sendBillPerDay); //done
router.post('/send-to-group', verifyToken, checkAccess('customer', 'read'), sendToGroup); //done
router.post('/send-sms', verifyToken, checkAccess('customer', 'read'), sendToOne ); //done

router.put('/sms-config-update',verifyToken, updateSMSConfig);  //done
router.post('/sms-config',verifyToken, createSMSConfig);  //done

router.post('/send-sms-unpaid' ,verifyToken , sendUnpaidCustomers); //done

router.post('/send-sms-low-balance',verifyToken, sendLowBalanceCustomers); //done

router.post('/send-sms-high-balance',verifyToken, sendHighBalanceCustomers); //done


router.post('/send-sms-custom-balance',verifyToken, sendCustomersAboveBalance);

router.get('/sms-delivery-report' ,updateSmsDeliveryStatus);
router.get('/sms-history',verifyToken, getSmsMessages);
//router.post('/auto-sms' , sendSMS)

module.exports = router;