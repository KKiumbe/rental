const { generateAccessToken } = require("../../middleware/mpesa/mpesaAccessToken.js");
const { generateTimestamp } = require("./timeStamp.js");
const axios = require('axios');

const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;

const initiatePayment = async (accessToken, paymentRequest) => {
  const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', paymentRequest, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
};

const lipaNaMpesa = async (req, res) => {
  try {
    // Generate an access token for authentication
    const accessToken = await generateAccessToken(consumerKey, consumerSecret);
    const timestamp = generateTimestamp();
    
    // Ensure the password is generated correctly
    const password = Buffer.from(`${process.env.BUSINESS_SHORTCODE}${process.env.PASS_KEY}${timestamp}`).toString('base64');

    const paymentRequest = {
      BusinessShortCode: process.env.BUSINESS_SHORTCODE, // Use environment variable
      Password: password, // Password generated correctly
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: req.body.amount,
      PartyA: req.body.phone, // Customer's phone number
      PartyB: process.env.BUSINESS_SHORTCODE, // Same as BusinessShortCode
      PhoneNumber: req.body.phone, // Corrected key name
      CallBackURL: 'https://taqa.onrender.com/api/callback', // Update with your callback URL
      AccountReference: 'YOUR_ORDER_ID',
      TransactionDesc: 'Payment for Order',
    };

    // Make the payment request
    const paymentResponse = await initiatePayment(accessToken, paymentRequest);

    console.log(paymentResponse);
    res.status(200).json({ message: 'Payment initiated successfully', data: paymentResponse });
  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({ message: 'Payment initiation failed', error: error.response?.data || error.message });
  }
};

module.exports = {
  lipaNaMpesa
};
