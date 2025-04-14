const { PrismaClient } = require('@prisma/client'); // Import Prisma Client
const prisma = new PrismaClient(); // Create an instance of Prisma Client

const sanitizePhoneNumber = (phone) => {
    if (!phone) return null;

    // Remove all non-numeric characters
    let sanitized = phone.replace(/\D/g, '');

    // Normalize to start with '0' (Kenyan numbers usually start with '07' or '01')
    if (sanitized.startsWith('254')) {
        sanitized = '0' + sanitized.substring(3); // Convert '2547...' to '07...' or '2541...' to '01...'
    } else if (sanitized.startsWith('+254')) {
        sanitized = '0' + sanitized.substring(4);
    } else if (!sanitized.startsWith('0')) {
        return sanitized; // Invalid number format
    }

    return sanitized;
};


const SearchCustomers = async (req, res) => {
    const { phone, name } = req.query;
    const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user
    console.log("Tenant ID:", tenantId);
    console.log("Raw phone number:", phone);

    if (!tenantId) {
        return res.status(400).json({ message: 'Tenant ID is required' });
    }

    try {
        // If phone is provided, sanitize and search for an exact match
        if (phone) {
            const sanitizedPhone = sanitizePhoneNumber(phone);
            console.log("Sanitized phone number:", sanitizedPhone);

            const uniqueCustomer = await prisma.customer.findMany({
                where: {
                    phoneNumber: sanitizedPhone, // Exact match for phone
                    tenantId, // Filter by tenantId
                },
            });

            // Return the customer if found, otherwise return null
            return res.json(uniqueCustomer.length ? uniqueCustomer : { message: 'No customers found' });
        }

        // If name is provided, search by first or last name
        let query = {
            where: {
                tenantId, // Filter by tenantId
            },
        };

        if (name) {
            query.where.OR = [
                {
                    firstName: {
                        contains: name, // Pattern matching for first name
                        mode: 'insensitive', // Case insensitive
                    },
                },
                {
                    lastName: {
                        contains: name, // Pattern matching for last name
                        mode: 'insensitive', // Case insensitive
                    },
                },
            ];
        }

        // Fetch customers based on the query
        const customers = await prisma.customer.findMany(query);

        // Return response
        if (customers.length > 0) {
            res.json(customers);
        } else {
            res.status(404).json({ message: "No customer found " });
        }


    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ message: 'Error fetching customers' });
    }
};


const SearchCustomersByName = async (req, res) => {
    const { name } = req.query;
    const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user
  
    // Log incoming data for debugging
    console.log("Tenant ID:", tenantId);
    console.log("Search name:", name);
  
    // Validate required parameters
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID is required" });
    }
  
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
  
    try {
      // Search for customers by name (case-insensitive) and tenantId
      const customers = await prisma.customer.findMany({
        where: {
          tenantId,
          OR: [
            { firstName: { contains: name, mode: "insensitive" } },
            { lastName: { contains: name, mode: "insensitive" } },
          ],
        },
      });
  
      // Return response
      if (customers.length > 0) {
        res.json(customers);
      } else {
        res.status(404).json({ message: "No customers found with this name" });
      }
    } catch (error) {
      console.error("Error searching customers by name:", error);
      res.status(500).json({ message: "Failed to search customers", error: error.message });
    }
  };
  
  // Assuming you already have this from your previous code
  const SearchCustomersByPhoneNumber = async (req, res) => {
    const { phone } = req.query;
    const tenantId = req.user?.tenantId;
  
    console.log("Tenant ID:", tenantId);
    console.log("Raw phone number:", phone);
  
    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID is required" });
    }
  
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }
  
    try {
      const sanitizedPhone = sanitizePhoneNumber(phone);
      console.log("Sanitized phone number:", sanitizedPhone);
  
      const customer = await prisma.customer.findUnique({
        where: {
          phoneNumber: sanitizedPhone,
          tenantId,
        },
      });
  
      if (customer) {
        res.json(customer);
        console.log(`this is the customer ${JSON.stringify(customer)}`);
      } else {
        res.status(404).json({ message: "No customer found with this phone number" });
      }
    } catch (error) {
      console.error("Error searching customers by phone:", error);
      res.status(500).json({ message: "Failed to search customers", error: error.message });
    }
  };

  


  

  


module.exports = { SearchCustomers,SearchCustomersByPhoneNumber,SearchCustomersByName };
