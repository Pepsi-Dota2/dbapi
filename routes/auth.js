const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');

// 🗂 Global online user tracking
let onlineUsers = {}; // user_id: { socketId, username }

router.post('/saledblogin', async (req, res) => {
  const { username, password, device_id } = req.body;
  console.log('Login attempt:', { username, device_id });
  if (!username || !password || !device_id) {
    return res.status(400).json({ message: 'Missing login data' });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password, role, device_id FROM users_db WHERE username = $1 AND password = $2`,
      [username, password]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = result.rows[0];

    if (!user.device_id) {
      await pool.query(`UPDATE users_db SET device_id = $1 WHERE username = $2`, [device_id, username]);
    }

    const token = jwt.sign(
      { user_id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await pool.query(
      `INSERT INTO login_logs_saledb (user_id, username, device_id, ip_address, login_time) VALUES ($1, $2, $3, $4, NOW())`,
      [user.id, user.username, device_id, ip]
    );
    await pool.query(`UPDATE users_db SET device_id = $1, last_login = NOW() WHERE username = $2`, [device_id, username]);
    res.status(200).json({ message: 'Login successful', role: user.role, token, user_id: user.id, username: user.username });
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

// 📡 GET Login Logs
router.get('/login-logs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, user_id, username, device_id, ip_address, login_time
      FROM login_logs_saledb
      ORDER BY login_time DESC
      LIMIT 100
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching login logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/online-users', (req, res) => {
  console.log('📡 Online Users API called:', Object.values(onlineUsers));
  res.json(Object.values(onlineUsers));
});

function initSocket(io) {
  io.on('connection', (socket) => {
    console.log('🔌 New connection:', socket.id);
    socket.on('user-online', ({ user_id, username }) => {
      onlineUsers[user_id] = { socketId: socket.id, username, user_id };
      console.log(`✅ User online: ${username}`);
      io.emit('update-online-users', Object.values(onlineUsers));
    });
    socket.on('disconnect', () => {
      for (const id in onlineUsers) {
        if (onlineUsers[id].socketId === socket.id) {
          console.log(`❌ User offline: ${onlineUsers[id].username}`);
          delete onlineUsers[id];
          break;
        }
      }
      io.emit('update-online-users', Object.values(onlineUsers));
    });
  });
}
router.get('/all-users-status', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id AS user_id, username, last_login
      FROM users_db
    `);
    const allUsers = result.rows;
    const usersWithStatus = allUsers.map(user => ({
      ...user,
      status: onlineUsers[user.user_id] ? 'online' : 'offline'
    }));
    res.json(usersWithStatus);
  } catch (err) {
    console.error('❌ Error fetching all users:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = { router, initSocket };
