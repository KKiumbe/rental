
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const verifyToken = async (req, res, next) => {
  // Get token from cookies
  const token = req.cookies.token;

  // Avoid logging sensitive token information
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication token is required' });
  }

  try {
    // Decode the token to get user data
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', {
      id: decoded.id,
      phoneNumber: decoded.phoneNumber,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
    }); // Debug log (avoid logging the full token)

    // Validate required fields in the token payload
    if (!decoded.id || !decoded.tenantId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    // Verify user exists and is active, fetching all required fields
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        tenantId: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'User account is disabled' });
    }

    // Attach the user information to the request object
    req.user = {
      userId: user.id, // Map to userId for consistency with createBuilding
      phoneNumber: user.phoneNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    // Proceed to the next middleware or route handler
    next();
  } catch (err) {
    console.error('Authentication error:', {
      error: err.message,
      stack: err.stack,
    });
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  } finally {
    await prisma.$disconnect();
  }
};


module.exports = verifyToken;
