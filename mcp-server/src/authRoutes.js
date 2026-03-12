// In mcp-server/src/authRoutes.js
// Phase D: Auth routes with refresh token support.
// JWT is issued with 15-minute expiry; a rotating refresh token (7-day, HTTP-only cookie)
// is used for seamless re-authentication without re-entering credentials.

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { prisma } = require('./prisma');
const { writeAuditLog } = require('./services/auditService');
const logger = require("./logger");

const router = Router();

// Rate limiters for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // 20 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // 10 refreshes per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token refresh requests. Please slow down.' },
});

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production environments.');
  } else {
    logger.warn('Warning: JWT_SECRET is not set. Using an insecure default value for development.');
    JWT_SECRET = 'insecure-default-secret-for-dev';
  }
}

// JWT lifetime — short for security; refresh token keeps sessions alive.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
// Refresh token lifetime
const REFRESH_TOKEN_TTL_DAYS = 7;

/**
 * Issue a signed JWT for the given user.
 */
function issueJwt(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Create a refresh token, store its hash in Postgres, and set an HTTP-only cookie.
 */
async function issueRefreshToken(userId, res) {
  const raw = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({ data: { tokenHash, userId, expiresAt } });

  res.cookie('refreshToken', raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth/refresh',
  });

  return raw;
}

// === POST /api/auth/register ===
router.post('/register', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || password.length < 8) {
    return res.status(400).json({
      error: 'Username and a password of at least 8 characters are required.',
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        password: hashedPassword,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: 'REGISTER',
      resourceType: 'User',
      resourceId: user.id,
      outcome: 'SUCCESS',
      req,
    });

    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'An error occurred during registration.' });
  }
});

// === POST /api/auth/login ===
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!user) {
      await writeAuditLog({ action: 'LOGIN_FAILED', outcome: 'FAILURE', metadata: { username }, req });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await writeAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILED',
        resourceType: 'User',
        resourceId: user.id,
        outcome: 'FAILURE',
        req,
      });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = issueJwt(user);
    await issueRefreshToken(user.id, res);

    await writeAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      resourceType: 'User',
      resourceId: user.id,
      outcome: 'SUCCESS',
      req,
    });

    res.json({ message: 'Login successful!', token });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

// === POST /api/auth/refresh ===
// Validates the HTTP-only refresh token cookie and issues a new JWT + rotated refresh token.
// CSRF note: The refresh token cookie is set with SameSite=Strict which prevents
// cross-site requests from triggering this endpoint. This is the modern alternative
// to CSRF tokens for cookie-based flows on same-origin requests.
router.post('/refresh', refreshLimiter, async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (!raw) {
    return res.status(401).json({ error: 'No refresh token provided.' });
  }

  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');

  try {
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      // Clear the cookie on invalid/expired/used token
      res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      await writeAuditLog({
        action: 'TOKEN_REFRESH_FAILED',
        outcome: 'FAILURE',
        metadata: { reason: stored?.usedAt ? 'already_used' : 'invalid_or_expired' },
        req,
      });
      return res.status(401).json({ error: 'Refresh token is invalid or expired.' });
    }

    // Rotate: mark as used
    await prisma.refreshToken.update({ where: { tokenHash }, data: { usedAt: new Date() } });

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      // User referenced by the refresh token no longer exists.
      // Clear the cookie so the client stops retrying, revoke all tokens for that userId,
      // and write a failure audit event.
      res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      try {
        await prisma.refreshToken.updateMany({
          where: { userId: stored.userId, usedAt: null },
          data: { usedAt: new Date() },
        });
      } catch (_) {
        // Ignore — best-effort cleanup
      }
      await writeAuditLog({
        userId: stored.userId,
        action: 'TOKEN_REFRESH_FAILED',
        resourceType: 'User',
        resourceId: stored.userId,
        outcome: 'FAILURE',
        metadata: { reason: 'user_not_found' },
        req,
      });
      return res.status(401).json({ error: 'User not found.' });
    }

    const newToken = issueJwt(user);
    await issueRefreshToken(user.id, res);

    await writeAuditLog({
      userId: user.id,
      action: 'TOKEN_REFRESH_SUCCESS',
      resourceType: 'User',
      resourceId: user.id,
      outcome: 'SUCCESS',
      req,
    });

    res.json({ token: newToken });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'An error occurred during token refresh.' });
  }
});

// === POST /api/auth/logout ===
router.post('/logout', authLimiter, async (req, res) => {
  const raw = req.cookies?.refreshToken;

  if (raw) {
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    try {
      await prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { usedAt: new Date() },
      });
    } catch (_) {
      // Ignore — best effort
    }
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  }

  // Log the auth header user if available
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      await writeAuditLog({
        userId: decoded.userId,
        action: 'LOGOUT',
        resourceType: 'User',
        resourceId: decoded.userId,
        outcome: 'SUCCESS',
        req,
      });
    } catch (_) {
      // Expired tokens are still valid logout targets
    }
  }

  res.json({ message: 'Logged out.' });
});

module.exports = router;