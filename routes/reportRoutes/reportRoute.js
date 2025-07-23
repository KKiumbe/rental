// routes/reportRoutes.js
const express = require('express');
const { getAllActiveCustomersReport, generateGarbageCollectionReport, getTenantsByLandlordReport } = require('../../controller/reports/allCustomers.js');
const { downloadInvoice } = require('../../controller/reports/invoicePDFGen.js');
const {getCurrentCustomersDebt, getCustomersWithHighDebt, getCustomersWithLowBalance} = require('../../controller/reports/debtReport.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { generateAgeAnalysisReport } = require('../../controller/reports/ageAnalysisReport.js');
const { generateDormantCustomersReport, getDormantCustomersReport } = require('../../controller/reports/dormantCustomers.js');
const { generateMonthlyInvoiceReport } = require('../../controller/reports/monthlyInvoiceReport.js');
const { generatePaymentReportPDF, generateMpesaReport, generateReceiptReport, generateIncomeReport } = require('../../controller/reports/payment/paymentReport.js');
const { getLandlordRentReport, getIncomePerBuilding, getIncomePerLandlord } = require('../../controller/reports/landlord/landlordReport.js');
const { getExpectedIncomePerBillType } = require('../../controller/reports/invoices/expectedIncome.js');
const router = express.Router();

// Define the route for the debt report

router.get('/reports/customers',verifyToken, checkAccess("invoices", "read"), getAllActiveCustomersReport); //done

router.get('/reports/dormant',verifyToken, checkAccess("customer", "read"), getDormantCustomersReport); //done

router.get('/reports/tenant-per-landlord',verifyToken, checkAccess("customer", "read"), getTenantsByLandlordReport); //done


//landlord  report route

//income-per-landlord
router.get('/reports/income-per-landlord',verifyToken, checkAccess("customer", "read"),  getIncomePerLandlord); //done
router.get('/reports/landlord-rent',verifyToken, checkAccess("customer", "read"), getLandlordRentReport);

router.get('/reports/income-per-building',verifyToken, checkAccess("customer", "read"), getIncomePerBuilding);

//done

router.get('/reports/monthly-invoice',verifyToken, checkAccess("invoices", "read"), generateMonthlyInvoiceReport); //done

router.get('/reports/age-analysis',verifyToken, checkAccess("invoices", "read"), generateAgeAnalysisReport); //done
router.get('/reports/customers-debt-high',verifyToken, checkAccess("invoices", "read"), getCustomersWithHighDebt);
router.get('/reports/customers-debt-low',verifyToken, checkAccess("invoices", "read"), getCustomersWithLowBalance);

//expected income report
router.get('/reports/expected-income-per-type',verifyToken, checkAccess("invoices", "read"), getExpectedIncomePerBillType); //done

router.get('/download-invoice/:invoiceId',verifyToken, checkAccess("invoices", "read"), downloadInvoice); 





router.get('/reports/payments',verifyToken, checkAccess("payments", "read"), generatePaymentReportPDF); //done


router.get('/reports/mpesa',verifyToken, checkAccess("payments", "read"), generateMpesaReport);

router.get('/reports/receipts',verifyToken, checkAccess("payments", "read"), generateReceiptReport);

router.get('/reports/income',verifyToken, checkAccess("payments", "read"), generateIncomeReport);






  
module.exports = router;
