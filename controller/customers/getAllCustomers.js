// Import Prisma Client
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); 

// Get all customers for the authenticated tenant
const getAllCustomers = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: "Tenant ID is required" });
        }

        // Get pagination params (default: page=1, limit=10)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit; // Offset calculation

        // Fetch total count (for frontend pagination)
        const totalCustomers = await prisma.customer.count({
            where: { tenantId },
        });

        // Fetch paginated customers
        const customers = await prisma.customer.findMany({
            where: { tenantId },
            skip,
            take: limit,
            orderBy: { createdAt: "desc" }, // Optional: Order by latest
        });

        res.status(200).json({
            customers,
            total: totalCustomers, // Send total count for pagination
            currentPage: page,
            totalPages: Math.ceil(totalCustomers / limit),
        });
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


// Export the function
module.exports = { getAllCustomers };
