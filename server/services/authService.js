const jwt = require('jsonwebtoken');

const verifyCredentials = (email, password) =>
  email === process.env.AUTH_EMAIL && password === process.env.AUTH_PASSWORD;

const signToken = (email) =>
  jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '8h' });

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
};

module.exports = { verifyCredentials, signToken, requireAuth };
