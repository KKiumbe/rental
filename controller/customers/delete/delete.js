const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearCustomerData() {
  try {
    const deleteResult = await prisma.customer.deleteMany({});
    console.log(`Deleted ${deleteResult.count} customers and their related data.`);
    return deleteResult.count;
  } catch (error) {
    console.error('Error clearing customer data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Example additional function
async function getCustomerCount() {
  try {
    const count = await prisma.customer.count();
    console.log(`Found ${count} customers.`);
    return count;
  } catch (error) {
    console.error('Error counting customers:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  clearCustomerData,
  getCustomerCount,
};