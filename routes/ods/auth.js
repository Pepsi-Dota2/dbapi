const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../../db');  // PostgreSQL connection
require('dotenv').config();
const SECRET = 'my_secret_token';
const REFRESH_SECRET = 'my_refresh_secret_token';
const dayjs = require('dayjs');
// 🔐 Simplified Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username, password });
  const result = await pool.query('SELECT * FROM ods_user WHERE username = $1', [username]);
  const user = result.rows[0];

  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const accessToken = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, { expiresIn: '7d' });

  res.json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

// Refresh token
router.post('/refresh-token', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.sendStatus(401);

  jwt.verify(refreshToken, REFRESH_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    const newAccessToken = jwt.sign({ id: user.id }, SECRET, { expiresIn: '15m' });
    res.json({ accessToken: newAccessToken });
  });
});

// Protected route example
router.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: 'Protected data', user: req.user });
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

router.get('/generate-order-id', async (req, res) => {
  const client = await pool.connect();
  try {
    const today = dayjs().format('YYYYMMDD');
    const prefix = `ORD${today}`;

    const result = await client.query(`
      SELECT MAX(order_number) as max_id
      FROM ods_orders
      WHERE order_number LIKE $1
    `, [`${prefix}%`]);

    const maxId = result.rows[0].max_id;

    let newNumber = 1;
    if (maxId) {
      const lastDigits = maxId.slice(-3); // get last 3 digits
      newNumber = parseInt(lastDigits) + 1;
    }

    const orderId = `${prefix}${String(newNumber).padStart(3, '0')}`;
    res.json({ order_id: orderId });

  } catch (error) {
    console.error('Error generating order ID:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});
// GET /api/suppliers
router.get('/suppliers', async (req, res) => {
  try {
    const result = await pool.query(`
          select code,name_1 from ap_supplier
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching suppliers:', err);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});
// GET /api/sparepart?search=abc
router.get('/sparepart', async (req, res) => {
  const { search = '' } = req.query;

  try {
    let result;

    if (search.trim() === '') {
      // ຖ້າຄ່າ search ວ່າງ → ດຶງ 10 ລາຍການລ່າສຸດ
      result = await pool.query(`
        SELECT code, name_1, unit_cost
        FROM ic_inventory
        WHERE group_main = '14'
        ORDER BY name_1
        LIMIT 10
      `);
    } else {
      // ຄົ້ນຫາຕາມຊື່
      result = await pool.query(
        `SELECT code, name_1, unit_cost
         FROM ic_inventory 
         WHERE group_main = '14' AND LOWER(name_1) LIKE LOWER($1)
         ORDER BY name_1
         LIMIT 10`,
        [`%${search}%`]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching spare parts:', err);
    res.status(500).json({ error: 'Failed to fetch spare parts' });
  }
});


router.post('/sparepart-insert', async (req, res) => {
  const {
    code,
    name_1,
    name_2,
    group_main,
    group_sub,
    group_sub2,
    item_category,
    item_brand,
    unit_standard,
    unit_cost,
    account_code_1,
    account_code_2,
    account_code_3,
    account_code_4,
    unit_standard_stand_value,
    unit_standard_divide_value
  } = req.body;

  try {
    const result = await pool.query(`INSERT INTO ic_inventory (code, name_1, name_2, group_main, group_sub, group_sub2,item_category, item_brand, unit_standard, unit_cost,
        account_code_1, account_code_2, account_code_3, account_code_4,unit_standard_stand_value, unit_standard_divide_value) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,$9, $10, $11, $12, $13, $14, $15, $16)RETURNING *;
    `, [
      code, name_1, name_2, group_main, group_sub, group_sub2,
      item_category, item_brand, unit_standard, unit_cost,
      account_code_1, account_code_2, account_code_3, account_code_4,
      unit_standard_stand_value, unit_standard_divide_value
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Insert error:', err);
    res.status(500).json({ error: 'Insert failed' });
  }
});



module.exports = router;
