const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const ROLE_PERMISSIONS = require('../../DatabaseConfig/role.js');
const { configureTenantSettings } = require('../smsConfig/config.js');
const prisma = new PrismaClient();
dotenv.config();




const register = async (req, res) => {
  const {
    firstName,
    lastName,
    phoneNumber,
    email,
    county,
    town,
    gender,
    password,
    tenantName,
  } = req.body;

  try {
    // Enhanced input validation
    if (!firstName || !lastName || !phoneNumber || !email || !password || !tenantName) {
      return res.status(400).json({ message: 'All fields (firstName, lastName, phoneNumber, email, password, tenantName) are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (phoneNumber.length < 9 || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({ message: 'Phone number must be numeric and at least 9 digits' });
    }

    // Check for existing user by phoneNumber or email
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phoneNumber }, { email }],
      },
    });

    if (existingUser) {
      const conflictField = existingUser.phoneNumber === phoneNumber ? 'Phone number' : 'Email';
      return res.status(400).json({ message: `${conflictField} is already registered` });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Define default roles
    const defaultRoles = ['ADMIN'];

    // Validate roles against ROLE_PERMISSIONS
    const validRoles = Object.keys(ROLE_PERMISSIONS);
    const invalidRoles = defaultRoles.filter((role) => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      return res.status(500).json({
        message: `Invalid roles: ${invalidRoles.join(', ')}. Must be defined in ROLE_PERMISSIONS`,
      });
    }

    // Transaction to create tenant, user, and log activities
    const { user, tenant } = await prisma.$transaction(async (prisma) => {
      const tenantCount = await prisma.tenant.count();

      // Create tenant first
      const newTenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          subscriptionPlan: 'Default Plan',
          monthlyCharge: 0.0,
          createdBy: firstName, // Set to null initially
          status: 'ACTIVE',
        },
      });

      // Create user with tenantId
      const newUser = await prisma.user.create({
        data: {
          firstName,
          lastName,
          phoneNumber,
          email,
          county: county || null,
          town: town || null,
          gender: gender || null,
          password: hashedPassword,
          role: defaultRoles,
          tenantId: newTenant.id,
          lastLogin: new Date(),
          loginCount: 1,
          status: 'ACTIVE',
        },
      });

      // Update tenant with createdBy
      await prisma.tenant.update({
        where: { id: newTenant.id },
        data: { createdBy: newUser.id.toString() },
      });

      // Log the creation in AuditLog
      await prisma.auditLog.create({
        data: {
          tenantId: newTenant.id,
          userId: newUser.id,
          action: 'CREATE',
          resource: 'USER_TENANT',
          details: { message: `User ${newUser.email} created tenant ${tenantName}` },
        },
      });

      // Log the creation in UserActivity
      await prisma.userActivity.create({
        data: {
          user: { connect: { id: newUser.id } },
          tenant: { connect: { id: newTenant.id } },
          action: 'USER_TENANT_CREATED',
          details: {
            userEmail: newUser.email,
            tenantName: newTenant.name,
          },
          timestamp: new Date(),
        },
      });

      return { user: newUser, tenant: newTenant };
    });

    // Configure tenant settings
    try {
      await configureTenantSettings(tenant.id);
    } catch (configError) {
      console.warn(`Failed to configure tenant settings for tenant ${tenant.id}:`, configError);
    }

    // Success response
    res.status(201).json({
      message: 'User and organization created successfully',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        tenantId: tenant.id,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
    });
  } catch (error) {
    console.error('Error registering user and organization:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Email, phone number, or tenant number already exists' });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = register;







const signin = async (req, res) => {
  const { phoneNumber, password } = req.body;

  try {
    // Find the user by phone number
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: {
        tenant: true, // Include tenant details to confirm association, remove if unnecessary
      },
    });

    // Check if user exists
    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Compare the provided password with the hashed password in the database
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }


    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        loginCount: { increment: 1 }, // Increase login count
      },
    });

    // Log the login action
    await prisma.userActivity.create({
      data: {
        user: { connect: { id: user.id } },
        tenant: { connect: { id: user.tenantId } },
        action: `User ${user.firstName} ${user.lastName} logged in`,
        timestamp: new Date(),
      },
    });



    // Generate a JWT token with the necessary claims
    const token = jwt.sign(
      { 
        id: user.id, 
        phoneNumber: user.phoneNumber, 
        role: user.role, 
        tenantId: user.tenantId 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' } // Token expires in 1 day
    );

    // Set the token in an HTTP-only cookie for security
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      maxAge: 24 * 60 * 60 * 1000, // Cookie expires in 1 day
    });

    // Exclude the password from the response and send user info
    const { password: userPassword, ...userInfo } = user;

    // Optionally, send back user-related info, depending on the application needs
    res.status(200).json({ message: 'Login successful', user: userInfo });

  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};




module.exports = { register,signin}; // Ensure to export the functions
