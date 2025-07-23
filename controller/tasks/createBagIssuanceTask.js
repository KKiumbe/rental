const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const createTaskForIssuingTrashBags = async (req, res) => {
  const { assigneeId, collectionDay, declaredBags } = req.body; // Single assigneeId and number of declared bags
  const { user: userId, tenantId } = req.user; // Fetch user ID and tenant ID from authentication middleware

  // Validate inputs
  if (!assigneeId || declaredBags === null || declaredBags === undefined || declaredBags <= 0) {
    return res.status(400).json({
      error: "Invalid input. Provide a valid assignee and a valid number of declared bags.",
    });
  }

  try {
    // Validate that the provided assignee belongs to the same tenant
    const assignee = await prisma.user.findFirst({
      where: {
        id: assigneeId,
        tenantId, // Ensure assignee belongs to the tenant
      },
      select: { role: true, bagsHeld: true }, // Fetch the number of bags held by the assignee
    });

    if (!assignee || !assignee.role.includes("collector")) {
      return res.status(400).json({
        error: "The assignee does not exist or does not have the 'collector' role.",
      });
    }

    // Fetch customers within the tenant based on filters
    const filters = { tenantId, status: "ACTIVE" }; // Filter by tenantId and active status
    if (collectionDay) filters.garbageCollectionDay = collectionDay.toUpperCase();

    const customers = await prisma.customer.findMany({
      where: filters,
    });

    if (customers.length === 0) {
      return res.status(404).json({ error: "No customers found for the given filters." });
    }

    // Create the task for issuing trash bags
    const task = await prisma.task.create({
      data: {
        type: "BAG_ISSUANCE", // Indicate the task type
        status: "PENDING", // Task is pending until the assignee starts
        declaredBags, // Declare the number of bags in the task
        remainingBags: declaredBags, // Initialize remainingBags with declaredBags
        createdBy: userId, // Track who created the task
        tenantId, // Associate the task with the tenant
      },
    });

    // Assign the task to the assignee
    await prisma.taskAssignee.create({
      data: {
        assigneeId,
        taskId: task.id,
      },
    });

    // Save all customers in the TrashBagIssuance table with `bagsIssued` set to `declaredBags`
    const issuanceData = customers.map((customer) => ({
      taskId: task.id,
      customerId: customer.id,
      bagsIssued: 0, // Default to 0
      issuedDate: new Date(),
      tenantId, // Associate issuance records with the tenant
    }));

    await prisma.trashBagIssuance.createMany({
      data: issuanceData,
    });

    // Create a notification for the assignee
    const notificationMessage = `New task assigned: Trash Bag Issuance with ${declaredBags} bags.`;
    await prisma.notification.create({
      data: {
        message: notificationMessage, // Task notification message
        userId: assigneeId, // Notify the assignee
        type: "trash bags issuance task",
        tenantId: tenantId,
      },
    });

    res.status(201).json({
      message: "Task created and assigned successfully.",
      task,
      customers, // List of customers included in the task
      declaredBags, // Number of bags declared for the task
    });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ error: "Error creating task.", details: error.message });
  }
};

module.exports = {
  createTaskForIssuingTrashBags,
};
