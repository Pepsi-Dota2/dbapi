const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const poolpoos = require('../../db1');  // PostgreSQL connection
require('dotenv').config();

// 🔐 Simplified Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await poolpoos.query(
      `SELECT code, name_1, title, ic_wht, ic_shelf, side, department, area_code, logistic_code,branch_code  FROM erp_user WHERE code = $1 AND password = $2`,
      [username, password]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Invalid username or password' });
    }

    const user = result.rows[0];

    const token = jwt.sign(
      { username: user.code },  // Payload only has username
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({ data:result.rows,message: 'Login successful', token});
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 🛡 Token Verification Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Token required' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    res.status(403).json({ message: 'Invalid token' });
  }
}

// ✅ Example Protected Route
router.get('/protected', verifyToken, (req, res) => {
  res.json({ message: `Hello ${req.user.username}` });
});

module.exports = router;
