const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillCustomerUnits() {
  try {
    const units = await prisma.unit.findMany({
      where: {
        customerId: { not: null } // Only units with a customer assigned
      }
    });

    for (const unit of units) {
      const exists = await prisma.customerUnit.findFirst({
        where: {
          customerId: unit.customerId,
          unitId: unit.id
        }
      });

      if (!exists) {
        await prisma.customerUnit.create({
          data: {
            customerId: unit.customerId,
            unitId: unit.id
          }
        });
        console.log(`Backfilled unit ${unit.id} for customer ${unit.customerId}`);
      }
    }

    console.log('Backfilling complete.');
  } catch (err) {
    console.error('Error backfilling CustomerUnit:', err);
  } finally {
    await prisma.$disconnect();
  }
}

backfillCustomerUnits();
