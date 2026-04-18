'use strict';

const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'masaarna-cms-secret-key-change-in-production';

async function authenticateAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await db.getAsync('SELECT * FROM admins WHERE id = ? AND is_active = 1', decoded.id);
    if (!admin) return res.status(401).json({ error: 'Admin not found or inactive' });
    req.admin = admin;
    req.admin.permissions = JSON.parse(admin.permissions || '{}');
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requirePermission(key) {
  return (req, res, next) => {
    if (req.admin.role === 'superadmin') return next();
    if (req.admin.permissions[key]) return next();
    res.status(403).json({ error: 'Permission denied' });
  };
}

module.exports = { authenticateAdmin, requirePermission, JWT_SECRET };
