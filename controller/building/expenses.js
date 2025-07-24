const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

 const createExpense = async (req, res) => {
  try {
    const { buildingId, expenseType, amount, description, date } = req.body;
    const {tenantId,userId} = req.user;

    const building = await prisma.building.findUnique({
      where: { id: buildingId },
      select: { landlordId: true }
    });

    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    const expense = await prisma.buildingExpense.create({
      data: {
        tenantId,
        buildingId,
        landlordId: building.landlordId,
        expenseType,
        amount: parseFloat(amount),
        description,
        date: new Date(date)
      }
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
};
 const approveExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const approvedBy = req.user.userId;

    const expense = await prisma.buildingExpense.update({
      where: { id: expenseId },
      data: {
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date()
      }
    });

   

    res.json(expense);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to approve expense' });
  }
};


module.exports = {
  createExpense,
  approveExpense
};