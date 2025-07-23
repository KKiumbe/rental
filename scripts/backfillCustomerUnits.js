// scripts/backfillCustomerUnits.js

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany({
    where: { unitId: { not: null } },
  });

  for (const customer of customers) {
    const unit = await prisma.unit.findUnique({ where: { id: customer.unitId } });
    if (!unit) continue;

    await prisma.customerUnit.create({
      data: {
        customer: { connect: { id: customer.id } },
        unit: { connect: { id: unit.id } },
        startDate: new Date(),
      },
    });

    console.log(`Linked customer ${customer.id} to unit ${unit.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
