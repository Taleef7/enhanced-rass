// In mcp-server/src/authRoutes.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// It is critical to store this secret in an environment variable, not in code.
// We will create a ticket to address this later (part of Epic 3).
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-that-is-long-and-random';

// === POST /api/auth/register ===
// Handles new user registration
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || password.length < 8) {
    return res.status(400).json({
      error: 'Username and a password of at least 8 characters are required.',
    });
  }

  try {
    // Hash the password before storing it. Never store plain text passwords.
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(), // Store username in lowercase for consistency
        password: hashedPassword,
      },
    });

    // VERY IMPORTANT: Do not send the password back to the client, even the hash.
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);

  } catch (error) {
    // Prisma error code P2002 signifies a unique constraint violation.
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    console.error('Registration error:', error);
    res.status(500).json({ error: 'An error occurred during registration.' });
  }
});

// We will add the /login endpoint here in the next step.

export default router;