const rateLimit = require('express-rate-limit');

// General collection rate limiting - PER SESSION
// Since all requests come through nginx proxy (same IP), we key on session ID
const collectionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,            // 120 requests per minute (up from 60)
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use sessionId from body if available, fallback to IP
    const sessionId = req.body?.sessionId;
    if (sessionId) return `sess:${sessionId}`;
    return req.ip || req.connection.remoteAddress;
  },
  // Skip rate limiting for internal/Docker traffic if on local network
  skip: (req) => {
    const ip = req.ip || req.connection.remoteAddress || '';
    // Skip for localhost/internal docker traffic
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || 
           ip.startsWith('172.') || ip.startsWith('192.168.') || ip.startsWith('10.');
  }
});

// Stricter for credential submissions - PER SESSION
const credentialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,             // 60 credentials per minute (up from 20)
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sessionId = req.body?.sessionId;
    if (sessionId) return `cred:${sessionId}`;
    return req.ip || req.connection.remoteAddress;
  },
  skip: (req) => {
    const ip = req.ip || req.connection.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('172.') || 
           ip.startsWith('192.168.') || ip.startsWith('10.');
  }
});

// Camera capture rate limit
const cameraLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,             // 30 camera captures per minute
  message: { error: 'Camera rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sessionId = req.body?.sessionId;
    if (sessionId) return `cam:${sessionId}`;
    return req.ip || req.connection.remoteAddress;
  },
  skip: (req) => {
    const ip = req.ip || req.connection.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('172.') || 
           ip.startsWith('192.168.') || ip.startsWith('10.');
  }
});

// Admin login rate limit (keep strict)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { collectionLimiter, credentialLimiter, cameraLimiter, loginLimiter };