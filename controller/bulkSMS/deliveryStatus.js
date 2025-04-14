const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
require('dotenv').config();

const ENDPOINT = 'https://quicksms.advantasms.com/api/services/getdlr/'


// Function to update SMS delivery status
async function updateSmsDeliveryStatus(req, res) {
  const { clientsmsid } = req.body;  // Get clientsmsid from the request body

  if (!clientsmsid) {
    return res.status(400).json({ success: false, message: 'clientsmsid is required' });
  }



  console.log(ENDPOINT);

  try {
    // Send POST request to update the delivery status
    const response = await axios.post(ENDPOINT, {
      apikey: process.env.SMS_API_KEY,
      partnerID: process.env.PARTNER_ID,
      messageID: clientsmsid,
    });

    // Check the response from the API and log it
    if (response.status === 200) {
      console.log(`Updated delivery status for SMS ID ${clientsmsid}`);
      return res.status(200).json({
        success: true,
        message: `Successfully updated delivery status for SMS ID ${clientsmsid}`,
      });
    } else {
      return res.status(response.status).json({
        success: false,
        message: `Failed to update delivery status for SMS ID ${clientsmsid}`,
      });
    }
  } catch (error) {
    console.error('Error updating SMS delivery status:', error);

    // Return error response
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve SMS delivery status',
      error: error.message,
    });
  }
}






const getSmsMessages = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId; // Get tenantId from authenticated user

    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID is required" });
    }

    // Extract pagination parameters from request (default page = 1, limit = 10)
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    // Fetch paginated SMS records
    const smsRecords = await prisma.sMS.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total count of SMS records for this tenant
    const totalRecords = await prisma.sMS.count({ where: { tenantId } });

    res.json({
      data: smsRecords,
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
      totalRecords,
    });
  } catch (error) {
    console.error("Error fetching SMS:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};




  
  // Export the functions
  module.exports = {
    getSmsMessages,
    updateSmsDeliveryStatus,  // Make sure this function is defined if you're exporting it
  };
  