const rateLimit = require('express-rate-limit');

// General collection rate limiting
const collectionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  }
});

// Stricter for credential submissions
const credentialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});

// Admin login rate limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { collectionLimiter, credentialLimiter, loginLimiter };