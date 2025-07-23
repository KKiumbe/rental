const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();



const fetchMyTasks = async (req, res) => {
  const { user, tenantId } = req.user; // Extract user ID and tenant ID from the request

  // Validate user and tenant information
  if (!user || !tenantId) {
    return res.status(401).json({ error: "Unauthorized: User or tenant information missing." });
  }

  try {
    // Fetch tasks assigned to the user
    const assignedTasks = await prisma.task.findMany({
      where: {
        tenantId: 3,
        taskAssignees: {
          some: {
            assigneeId: 4
          }
        }
      },
      include: {
        taskAssignees: {
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true
              }
            }
          }
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true
          }
        },
       
       
         
      
        trashBagIssuances: {
          select: {
            id: true,
            bagsIssued: true,
            issuedDate: true,
            createdAt: true,
            updatedAt: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true
              }
            },
            issuedBy: {
              select: {
                id: true,
                assignee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }
    );


    const createdTasks = await prisma.task.findMany({
      where: {
        tenantId: tenantId,
        createdBy: user
      },
      include: {
        taskAssignees: {
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true
              }
            }
          }
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true
          }
        },
       
        trashBagIssuances: {
          select: {
            id: true,
            bagsIssued: true,
            issuedDate: true,
            createdAt: true,
            updatedAt: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true
              }
            },
            issuedBy: {
              select: {
                id: true,
                assignee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    // Format the response to ensure consistency
    res.status(200).json({
      assignedToMe: assignedTasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        declaredBags: task.declaredBags,
        remainingBags: task.remainingBags,
        assignedAt: task.assignedAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      
        creator: task.creator,
        assignees: task.taskAssignees.map((ta) => ta.assignee),
        garbageCollections: task.GarbageCollection,
        trashBagIssuances: task.trashBagIssuances.map((issuance) => ({
          id: issuance.id,
          bagsIssued: issuance.bagsIssued,
          issuedDate: issuance.issuedDate,
          createdAt: issuance.createdAt,
          updatedAt: issuance.updatedAt,
          customer: issuance.customer,
          issuedBy: issuance.issuedBy ? issuance.issuedBy.assignee : null,
        })),
      })),
      assignedByMe: createdTasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        declaredBags: task.declaredBags,
        remainingBags: task.remainingBags,
        assignedAt: task.assignedAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      
        creator: task.creator,
        assignees: task.taskAssignees.map((ta) => ta.assignee),
        garbageCollections: task.GarbageCollection,
        trashBagIssuances: task.trashBagIssuances.map((issuance) => ({
          id: issuance.id,
          bagsIssued: issuance.bagsIssued,
          issuedDate: issuance.issuedDate,
          createdAt: issuance.createdAt,
          updatedAt: issuance.updatedAt,
          customer: issuance.customer,
          issuedBy: issuance.issuedBy ? issuance.issuedBy.assignee : null,
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({
      error: "Failed to fetch tasks.",
      details: error.message, // Include error details for debugging
    });
  }
};




const fetchTaskDetails = async (req, res) => {
  const { taskId } = req.params; // Task ID from route parameters
  const { tenantId } = req.user; // Ensure the user’s tenant is used for filtering

  try {
    // Convert taskId to an integer
    const taskIdInt = parseInt(taskId, 10);

    if (isNaN(taskIdInt)) {
      return res.status(400).json({ message: "Invalid task ID format." });
    }

    // Fetch the task details
    const task = await prisma.task.findFirst({
      where: {
        id: taskIdInt, // Use the converted integer taskId
        tenantId, // Ensure the task belongs to the same tenant
      },
      include: {
        taskAssignees: {
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
              },
            },
          },
        },
        trashBagIssuances: {
          include: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                trashBagsIssued: true, // Include the trashBagsIssued field
              },
            },
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found or does not belong to this tenant." });
    }

    // Format the response
    const response = {
      taskDetails: {
        taskId: task.id,
        type: task.type,
        status: task.status,
        declaredBags: task.declaredBags,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
      assignees: task.taskAssignees.map((assignee) => ({
        assigneeId: assignee.assignee.id,
        name: `${assignee.assignee.firstName} ${assignee.assignee.lastName}`,
        phoneNumber: assignee.assignee.phoneNumber,
      })),
      customers: task.trashBagIssuances.map((issuance) => ({
        customerId: issuance.customer.id,
        name: `${issuance.customer.firstName} ${issuance.customer.lastName}`,
        phoneNumber: issuance.customer.phoneNumber,
        trashBagsIssued: issuance.customer.trashBagsIssued, // Include the trashBagsIssued state
        bagsIssued: issuance.bagsIssued, // Include bagsIssued status
      })),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching task details:", error);
    res.status(500).json({
      message: "Failed to fetch task details.",
      error: error.message,
    });
  }
};





module.exports = {
  fetchMyTasks,
  fetchTaskDetails,
};
