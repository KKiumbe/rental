const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ROLE_PERMISSIONS = require('../../DatabaseConfig/role'); // Path to the role permissions file


// Controller to register a new user (Admin only)
const registerUser = async (req, res) => {
  const { tenantId, firstName, lastName, email, phoneNumber, gender, county, town, password } = req.body;

  if (!req.user.role.includes('ADMIN')) {
    return res.status(403).json({ message: 'Access denied. Only admins can create users.' });
  }
  

  // Validate required fields
  if (!tenantId || !firstName || !lastName || !phoneNumber || !password) {
    return res.status(400).json({ message: 'Required fields are missing' });
  }

  try {
    // Check if the tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Check if the phone number already exists
    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Phone number is already registered.' });
    }

    // Define the default role
    const defaultRole = 'DEFAULT_ROLE'; // Ensure this role exists in ROLE_PERMISSIONS
    if (!ROLE_PERMISSIONS[defaultRole]) {
      return res.status(500).json({ message: 'Default role is not defined in ROLE_PERMISSIONS' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user
    const newUser = await prisma.user.create({
      data: {
        tenantId,
        firstName,
        lastName,
        email,
        phoneNumber,
        gender,
        county,
        town,
        password: hashedPassword,
        role: { set: [defaultRole] }, // Assign default role
        createdBy: req.user.id, // User ID of the admin who created the user
        lastLogin: new Date(), // ✅ Add this line
      },
    });
    
    return res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};






module.exports = { registerUser };
