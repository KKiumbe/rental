const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();


const markCustomerAsIssued = async (req, res) => {
  const { taskId } = req.params; // Task ID from the URL parameter
  const { customerId } = req.body; // Customer ID from the request body
  const { user } = req; // Assume `user` comes from authentication middleware (includes user.id and tenantId)

  // Validate input
  if (!taskId || !customerId) {
    return res.status(400).json({
      error: "Invalid input. Task ID and customer ID are required.",
    });
  }

  try {
    // Fetch the task to ensure it belongs to the tenant and has remaining bags
    const task = await prisma.task.findFirst({
      where: { id: parseInt(taskId), tenantId: user.tenantId, status: "PENDING" },
      select: { id: true, remainingBags: true },
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found or not in progress." });
    }

    if (task.remainingBags <= 0) {
      return res.status(400).json({ error: "No remaining bags available for this task." });
    }

    // Fetch the TaskAssignee to ensure the authenticated user is assigned to this task
    const taskAssignee = await prisma.taskAssignee.findFirst({
      where: {
        taskId: parseInt(taskId),
        assigneeId: user.id, // Ensure the authenticated user is the assignee
      },
    });

    if (!taskAssignee) {
      return res.status(403).json({
        error: "You are not assigned to this task and cannot issue bags.",
      });
    }

    // Fetch the customer to ensure they belong to the tenant
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId, status: "ACTIVE" },
      select: { trashBagsIssued: true },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found or not active in this tenant." });
    }

    if (customer.trashBagsIssued) {
      return res.status(400).json({
        error: `Customer ${customerId} has already been issued bags.`,
      });
    }

    // Fetch the tenant's standard number of bags
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { numberOfBags: true },
    });

    if (!tenant || !tenant.numberOfBags) {
      return res.status(400).json({
        error: "Tenant bag issuance limit not configured. Contact the administrator.",
      });
    }

    const standardBags = tenant.numberOfBags;

    // Create a new issuance record, linking to the TaskAssignee
    const newIssuance = await prisma.trashBagIssuance.create({
      data: {
        taskId: parseInt(taskId),
        customerId,
        tenantId: user.tenantId,
        issuedById: taskAssignee.id, // Link to the TaskAssignee record
        bagsIssued: standardBags,
        issuedDate: new Date(),
      },
    });

    // Update the customer's trashBagsIssued state
    await prisma.customer.update({
      where: { id: customerId },
      data: { trashBagsIssued: true },
    });

    // Decrease remainingBags in the Task table
    await prisma.task.update({
      where: { id: parseInt(taskId) },
      data: {
        remainingBags: {
          decrement: standardBags, // Reduce by the standard number of bags
        },
      },
    });

    // Check if all customers in the task have been issued bags
    const unissuedCustomers = await prisma.customer.count({
      where: {
        tenantId: user.tenantId,
        trashBagsIssued: false,
        trashbagsHistory: {
          some: {
            taskId: parseInt(taskId),
          },
        },
      },
    });

    if (unissuedCustomers === 0) {
      // All customers have been issued bags, mark task as COMPLETED
      await prisma.task.update({
        where: { id: parseInt(taskId) },
        data: { status: "COMPLETED" },
      });
    }

    res.status(200).json({
      message: `Successfully issued ${standardBags} bags to customer ${customerId} for task ${taskId}.`,
      newIssuance,
    });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      console.error('Prisma known error:', error.code, error.message);
      return res.status(400).json({ error: `Database error: ${error.message}` });
    } else {
      console.error("Error marking customer as issued:", error);
      return res.status(500).json({
        error: "An unexpected error occurred while marking the customer as issued.",
        details: error.message,
      });
    }
  } finally {
    await prisma.$disconnect(); // Clean up Prisma connection
  }
};

module.exports = { markCustomerAsIssued };


