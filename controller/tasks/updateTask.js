const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const updateTaskStatus = async (req, res) => {
  const { taskId } = req.params; // Task ID from the URL parameter
  const { status } = req.body; // New status from the request body
  const { user } = req; // Assume `user` comes from authentication middleware

  // Validate input
  if (!taskId || !status) {
    return res.status(400).json({
      error: "Task ID and status are required.",
    });
  }

  // Validate status
  const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELED"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Valid statuses are: ${validStatuses.join(", ")}`,
    });
  }

  try {
    // Fetch the task to ensure it belongs to the tenant
    const task = await prisma.task.findFirst({
      where: { id: parseInt(taskId), tenantId: user.tenantId },
      select: { id: true, createdBy: true },
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found or does not belong to your tenant." });
    }

    // Check if the user is the creator of the task or an admin
    if (user.id === task.createdBy || user.role === "ADMIN")  {
      return res.status(403).json({
        error: "You do not have permission to update the status of this task.",
      });
    }

    // Update the task status
    const updatedTask = await prisma.task.update({
      where: { id: parseInt(taskId) },
      data: { status },
    });

    res.status(200).json({
      message: `Task status updated to ${status} successfully.`,
      updatedTask,
    });
  } catch (error) {
    console.error("Error updating task status:", error);
    res.status(500).json({
      error: "An unexpected error occurred while updating the task status.",
      details: error.message,
    });
  }
};

module.exports = { updateTaskStatus };
