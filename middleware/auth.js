// Login check for API routes.
// Switch: REQUIRE_AUTH=on (Render -> Environment). Default is off, so deploying this file changes nothing by itself.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'krishi_connect_super_secret_jwt_key_2026_agro_market';

function isAuthRequired() {
  return String(process.env.REQUIRE_AUTH || 'off').toLowerCase() === 'on';
}

function requireAuth(req, res, next) {
  if (!isAuthRequired()) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, message: 'Pehle login karein.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    // Role now comes from the signed token, not from a header the browser can fake.
    req.headers['x-user-role'] = String(payload.role || '').toLowerCase();
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Session expire ho gaya. Dobara login karein.' });
  }
}

module.exports = { requireAuth, isAuthRequired };
