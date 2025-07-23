const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const configureTenantSettings = async (tenantId) => {
  // Hardcoded SMS Configuration Values
  const smsConfigData = {
    partnerId: "11914",
    apiKey: "43e4e97130d5a2d886667c2d40ce48df",
    shortCode: "TAQAMALI",
    customerSupportPhoneNumber: "0702550190",
  };

  // Hardcoded Tenant Update Values
  const tenantUpdateData = {
    subscriptionPlan: "Simba",
    monthlyCharge: 5000,
    numberOfBags: 5,
  };

  try {
    // Ensure the tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) {
      console.error(`Tenant with ID ${tenantId} not found.`);
      return { success: false, message: "Tenant not found." };
    }

    // Check if an SMSConfig already exists for the tenant
    const existingSMSConfig = await prisma.sMSConfig.findUnique({ where: { tenantId } });

    if (!existingSMSConfig) {
      // Create the new SMSConfig if it does not exist
      await prisma.sMSConfig.create({
        data: {
          tenantId,
          ...smsConfigData, // Hardcoded values
        },
      });
     
     // console.log(`SMS configuration created successfully for tenant ID: ${tenantId}`);
    } else {
      console.log(`SMS configuration already exists for tenant ID: ${tenantId}`);
    }

    // Update tenant details
    await prisma.tenant.update({
      where: { id: tenantId },
      data: tenantUpdateData,
    });



    return { success: true, message: "Configuration and tenant details updated successfully" };
  } catch (error) {
    console.error("Error configuring SMS settings and updating tenant:", error);
    return { success: false, message: "Failed to configure settings", error: error.message };
  }
};

module.exports = { configureTenantSettings };
