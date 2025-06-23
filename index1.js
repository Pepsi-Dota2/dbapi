require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 🔐 LOGIN
// const jwt = require('jsonwebtoken');
app.post('/api/saledblogin', async (req, res) => {
  const { username, password, device_id } = req.body;

  if (!username || !password || !device_id) {
    return res.status(400).json({ message: 'Missing login data' });
  }

  try {
    const result = await pool.query(
      `SELECT id, username, password, role, device_id FROM users_db WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.password !== password) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    if (user.device_id) {
      if (user.device_id !== device_id) {
        return res.status(403).json({ message: 'This device is not authorized' });
      }
    } else {
      await pool.query(
        `UPDATE users_db SET device_id = $1 WHERE username = $2`,
        [device_id, username]
      );
    }

    const token = jwt.sign(
      {
        user_id: user.id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // ✅ Save login history
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    await pool.query(
      `INSERT INTO login_logs_saledb (user_id, username, device_id, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [user.id, user.username, device_id, ipAddress]
    );

    return res.status(200).json({
      message: 'Login successful',
      role: user.role,
      token: token,
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// 🔐 VERIFY TOKEN Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ message: 'Token required' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token' });
  }
}

// ✅ Protected route
app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ message: `Welcome ${req.user.username}` });
});

// ✅ Test public route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'ສະບາຍດີຈາກ API 🚀' });
});



app.get('/api/sale/saletotal', async (req, res) => {
  try {
    const client = await pool.connect();

    const totalYearQuery = `
SELECT
  (SELECT SUM(targat_amount) FROM odg_target WHERE year_part = '2025') AS target,
  SUM(sum_amount) FILTER (WHERE yeardoc = '2025') AS revenue,
  SUM(sum_amount) FILTER (WHERE yeardoc = '2024') AS last_year
FROM odg_sale_detail;
      `;

    const totalAvgQuery = `
WITH 
current_month AS (
  SELECT EXTRACT(MONTH FROM CURRENT_DATE)::int AS month_now
),
target_sum AS (
  SELECT SUM(targat_amount) AS target
  FROM odg_target, current_month
  WHERE year_part = '2025' AND CAST(month_part AS INTEGER) <= month_now
),
sale_sum AS (
  SELECT 
    SUM(CASE WHEN yeardoc = '2025' AND EXTRACT(MONTH FROM doc_date) <= month_now THEN sum_amount ELSE 0 END) AS revenue,
    SUM(CASE WHEN yeardoc = '2024' AND EXTRACT(MONTH FROM doc_date) <= month_now THEN sum_amount ELSE 0 END) AS last_year
  FROM odg_sale_detail, current_month
)

SELECT t.target, s.revenue, s.last_year
FROM target_sum t, sale_sum s;

      `;

    const totalMonthQuery = `
WITH current_month AS (
  SELECT EXTRACT(MONTH FROM CURRENT_DATE)::int AS month_now
),
target_sum AS (
  SELECT SUM(targat_amount) AS target
  FROM odg_target, current_month
  WHERE year_part = '2025' AND CAST(month_part AS INTEGER) = month_now
),
sale_sum AS (
  SELECT 
    SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS revenue,
    SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
  FROM odg_sale_detail, current_month
  WHERE monthdoc = month_now  -- ✅ assumes you store monthdoc as integer
)

SELECT t.target, s.revenue, s.last_year
FROM target_sum t, sale_sum s;

      `;

    const totalYear = (await client.query(totalYearQuery)).rows[0];
    const totalAvg = (await client.query(totalAvgQuery)).rows[0];
    const totalMonth = (await client.query(totalMonthQuery)).rows[0];

    client.release();

    res.json({
      total_year: totalYear,
      total_avg: totalAvg,
      total_month: totalMonth
    });

  } catch (err) {
    console.error('Error fetching saletotal:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/sales/quarterly', async (req, res) => {
  try {
    const query = `
        WITH t AS (
          SELECT 
            CEIL(CAST(month_part AS INTEGER) / 3.0) AS quarter,
            SUM(targat_amount) AS target
          FROM odg_target
          WHERE year_part = '2025'
          GROUP BY CEIL(CAST(month_part AS INTEGER) / 3.0)
        ),
        s AS (
          SELECT 
            CEIL(EXTRACT(MONTH FROM doc_date) / 3.0) AS quarter,
            SUM(CASE 
                WHEN trans_flag = '48' THEN -1 * total_amount 
                ELSE total_amount 
            END) AS revenue
          FROM ic_trans
          WHERE trans_flag IN ('44', '48')
            AND used_status = 0
            AND TO_CHAR(doc_date, 'yyyy') = '2025'
          GROUP BY CEIL(EXTRACT(MONTH FROM doc_date) / 3.0)
        ),
        l AS (
          SELECT 
            CEIL(EXTRACT(MONTH FROM doc_date) / 3.0) AS quarter,
            SUM(CASE 
                WHEN trans_flag = '48' THEN -1 * total_amount 
                ELSE total_amount 
            END) AS last_year
          FROM ic_trans
          WHERE trans_flag IN ('44', '48')
            AND used_status = 0
            AND TO_CHAR(doc_date, 'yyyy') = '2024'
          GROUP BY CEIL(EXTRACT(MONTH FROM doc_date) / 3.0)
        )
  
        SELECT 
          q.quarter,
          COALESCE(t.target, 0) AS target,
          COALESCE(s.revenue, 0) AS revenue,
          COALESCE(l.last_year, 0) AS last_year
        FROM 
          (SELECT 1 AS quarter UNION ALL
           SELECT 2 UNION ALL
           SELECT 3 UNION ALL
           SELECT 4) q
        LEFT JOIN t ON t.quarter = q.quarter
        LEFT JOIN s ON s.quarter = q.quarter
        LEFT JOIN l ON l.quarter = q.quarter
        ORDER BY q.quarter;
      `;

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching quarterly sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/sales/monthly', async (req, res) => {
  try {
    const query = `
        WITH target_month AS (
          SELECT 
            CAST(month_part AS INTEGER) AS month,
            SUM(targat_amount) AS target
          FROM odg_target
          WHERE year_part = '2025'
          GROUP BY CAST(month_part AS INTEGER)
        ),
        revenue_month AS (
          SELECT 
            EXTRACT(MONTH FROM doc_date)::int AS month,
            SUM(CASE 
                  WHEN trans_flag = '48' THEN -1 * total_amount 
                  ELSE total_amount 
                END) AS revenue
          FROM ic_trans
          WHERE trans_flag IN ('44', '48')
            AND used_status = 0
            AND TO_CHAR(doc_date, 'yyyy') = '2025'
          GROUP BY EXTRACT(MONTH FROM doc_date)
        ),
        last_year_month AS (
          SELECT 
            EXTRACT(MONTH FROM doc_date)::int AS month,
            SUM(CASE 
                  WHEN trans_flag = '48' THEN -1 * total_amount 
                  ELSE total_amount 
                END) AS last_year
          FROM ic_trans
          WHERE trans_flag IN ('44', '48')
            AND used_status = 0
            AND TO_CHAR(doc_date, 'yyyy') = '2024'
          GROUP BY EXTRACT(MONTH FROM doc_date)
        )
        SELECT 
          m.month,
          COALESCE(t.target, 0) AS target,
          COALESCE(r.revenue, 0) AS revenue,
          COALESCE(l.last_year, 0) AS last_year
        FROM 
          (SELECT generate_series(1, 12) AS month) m
        LEFT JOIN target_month t ON m.month = t.month
        LEFT JOIN revenue_month r ON m.month = r.month
        LEFT JOIN last_year_month l ON m.month = l.month
        ORDER BY m.month;
      `;

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching monthly sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/sales/top-customers', async (req, res) => {
  try {
    const queryTopYear = `
        SELECT 
          a.cust_code, 
          b.name_1 AS cust_name, 
          SUM(CASE WHEN a.trans_flag = '48' THEN -1 * a.total_amount ELSE a.total_amount END) AS total_amount 
        FROM ic_trans a
        LEFT JOIN ar_customer b ON b.code = a.cust_code 
        WHERE a.trans_flag IN (44, 48) 
          AND TO_CHAR(a.doc_date, 'yyyy') = '2025'
        GROUP BY a.cust_code, b.name_1 
        ORDER BY total_amount DESC 
        LIMIT 10;
      `;

    const queryTopQuarter = `
        SELECT 
          b.name_1 AS name, 
          SUM(a.total_amount) AS total 
        FROM ic_trans a
        LEFT JOIN ar_customer b ON b.code = a.cust_code 
        WHERE a.trans_flag = '44' 
          AND TO_CHAR(a.doc_date, 'yyyy') = '2025' 
          AND CEIL(EXTRACT(MONTH FROM a.doc_date) / 3.0) = CEIL(EXTRACT(MONTH FROM CURRENT_DATE) / 3.0)
        GROUP BY b.name_1 
        ORDER BY total DESC 
        LIMIT 10;
      `;

    const queryTopMonth = `
        SELECT 
          b.name_1 AS name, 
          SUM(a.total_amount) AS total 
        FROM ic_trans a
        LEFT JOIN ar_customer b ON b.code = a.cust_code 
        WHERE a.trans_flag = '44' 
          AND TO_CHAR(a.doc_date, 'yyyy') = '2025' 
          AND TO_CHAR(a.doc_date, 'mm') = TO_CHAR(CURRENT_DATE, 'mm')
        GROUP BY b.name_1 
        ORDER BY total DESC 
        LIMIT 10;
      `;

    const [yearResult, quarterResult, monthResult] = await Promise.all([
      pool.query(queryTopYear),
      pool.query(queryTopQuarter),
      pool.query(queryTopMonth),
    ]);

    res.json({
      year: yearResult.rows,
      quarter: quarterResult.rows,
      month: monthResult.rows,
    });
  } catch (err) {
    console.error('Error fetching top customers:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/sales/top-products', async (req, res) => {
  try {
    const queryTopYear = `
        SELECT 
          item_code,
          item_name,
          SUM(CASE 
                WHEN trans_flag = '48' THEN -1 * sum_amount 
                ELSE sum_amount 
              END) AS total_amount
        FROM ic_trans_detail
        WHERE trans_flag IN ('44', '48')
          AND TO_CHAR(doc_date, 'yyyy') = '2025'
        GROUP BY item_code, item_name
        ORDER BY total_amount DESC
        LIMIT 10;
      `;

    const queryTopQuarter = `
        SELECT 
          item_code,
          item_name,
          SUM(CASE 
                WHEN trans_flag = '48' THEN -1 * sum_amount 
                ELSE sum_amount 
              END) AS total_amount
        FROM ic_trans_detail
        WHERE trans_flag IN ('44', '48')
          AND TO_CHAR(doc_date, 'yyyy') = '2025'
          AND CEIL(EXTRACT(MONTH FROM doc_date) / 3.0) = CEIL(EXTRACT(MONTH FROM CURRENT_DATE) / 3.0)
        GROUP BY item_code, item_name
        ORDER BY total_amount DESC
        LIMIT 10;
      `;

    const queryTopMonth = `
        SELECT 
          item_code,
          item_name,
          SUM(CASE 
                WHEN trans_flag = '48' THEN -1 * sum_amount 
                ELSE sum_amount 
              END) AS total_amount
        FROM ic_trans_detail
        WHERE trans_flag IN ('44', '48')
          AND TO_CHAR(doc_date, 'yyyy') = '2025'
          AND TO_CHAR(doc_date, 'mm') = TO_CHAR(CURRENT_DATE, 'mm')
        GROUP BY item_code, item_name
        ORDER BY total_amount DESC
        LIMIT 10;
      `;

    const [yearResult, quarterResult, monthResult] = await Promise.all([
      pool.query(queryTopYear),
      pool.query(queryTopQuarter),
      pool.query(queryTopMonth),
    ]);

    res.json({
      year: yearResult.rows,
      quarter: quarterResult.rows,
      month: monthResult.rows,
    });
  } catch (err) {
    console.error('Error fetching top products:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/sales/top10-customers-by-area', async (req, res) => {
  const fetchTop10ByScope = async (scopeQuery) => {
    const result = await pool.query(scopeQuery);
    const grouped = {};

    result.rows.forEach(row => {
      const area = row.area_name || 'All';
      if (!grouped[area]) {
        grouped[area] = [];
      }
      grouped[area].push({
        name: row.name_1,
        total: parseFloat(row.total_amount)
      });
    });

    return grouped;
  };

  try {
    const sql_year = `
        WITH ranked_year AS (
          SELECT 
            COALESCE(NULLIF(area_name, 'All'), 'All') AS area_name,
            customername AS name_1,
            SUM(sum_amount) AS total_amount,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(area_name, 'All'), 'All')
              ORDER BY SUM(sum_amount) DESC
            ) AS rn
          FROM odg_sale_detail
          WHERE yeardoc = '2025'
          GROUP BY COALESCE(NULLIF(area_name, 'All'), 'All'), customername
        )
        SELECT area_name, name_1, total_amount
        FROM ranked_year
        WHERE rn <= 10;
      `;

    const sql_quarter = `
        WITH ranked_quarter AS (
          SELECT 
            COALESCE(NULLIF(area_name, 'All'), 'All') AS area_name,
            customername AS name_1,
            SUM(sum_amount) AS total_amount,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(area_name, 'All'), 'All')
              ORDER BY SUM(sum_amount) DESC
            ) AS rn
          FROM odg_sale_detail
          WHERE yeardoc = '2025'
            AND CEIL(EXTRACT(MONTH FROM doc_date) / 3.0) = CEIL(EXTRACT(MONTH FROM CURRENT_DATE) / 3.0)
          GROUP BY COALESCE(NULLIF(area_name, 'All'), 'All'), customername
        )
        SELECT area_name, name_1, total_amount
        FROM ranked_quarter
        WHERE rn <= 10;
      `;

    const sql_month = `
        WITH ranked_month AS (
          SELECT 
            COALESCE(NULLIF(area_name, 'All'), 'All') AS area_name,
            customername AS name_1,
            SUM(sum_amount) AS total_amount,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(area_name, 'All'), 'All')
              ORDER BY SUM(sum_amount) DESC
            ) AS rn
          FROM odg_sale_detail
          WHERE yeardoc = '2025'
            AND TO_CHAR(doc_date, 'MM') = TO_CHAR(CURRENT_DATE, 'MM')
          GROUP BY COALESCE(NULLIF(area_name, 'All'), 'All'), customername
        )
        SELECT area_name, name_1, total_amount
        FROM ranked_month
        WHERE rn <= 10;
      `;

    const [year, quarter, month] = await Promise.all([
      fetchTop10ByScope(sql_year),
      fetchTop10ByScope(sql_quarter),
      fetchTop10ByScope(sql_month)
    ]);

    res.json({ year, quarter, month });

  } catch (err) {
    console.error('Error fetching top customers by area:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/sales/top10-product-by-area', async (req, res) => {
  const fetchTop10ByScope = async (scopeQuery) => {
    const result = await pool.query(scopeQuery);
    const grouped = {};

    result.rows.forEach(row => {
      const area = row.area_name || 'All';
      if (!grouped[area]) {
        grouped[area] = [];
      }
      grouped[area].push({
        name: row.name_1,
        total: parseFloat(row.total_amount)
      });
    });

    return grouped;
  };

  try {
    const sql_year_product = `
        WITH ranked AS (
          SELECT 
            COALESCE(NULLIF(area_name, 'All'), 'All') AS area_name,
            item_name AS name_1,
            SUM(sum_amount) AS total_amount,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(area_name, 'All'), 'All')
              ORDER BY SUM(sum_amount) DESC
            ) AS rn
          FROM odg_sale_detail
          WHERE yeardoc = '2025'
          GROUP BY COALESCE(NULLIF(area_name, 'All'), 'All'), item_name
        )
        SELECT area_name, name_1, total_amount
        FROM ranked WHERE rn <= 10;
      `;

    const sql_quarter_product = `
        WITH ranked AS (
          SELECT 
            COALESCE(NULLIF(area_name, 'All'), 'All') AS area_name,
            item_name AS name_1,
            SUM(sum_amount) AS total_amount,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(area_name, 'All'), 'All')
              ORDER BY SUM(sum_amount) DESC
            ) AS rn
          FROM odg_sale_detail
          WHERE yeardoc = '2025'
            AND CEIL(EXTRACT(MONTH FROM doc_date) / 3.0) = CEIL(EXTRACT(MONTH FROM CURRENT_DATE) / 3.0)
          GROUP BY COALESCE(NULLIF(area_name, 'All'), 'All'), item_name
        )
        SELECT area_name, name_1, total_amount
        FROM ranked WHERE rn <= 10;
      `;

    const sql_month_product = `
        WITH ranked AS (
          SELECT 
            COALESCE(NULLIF(area_name, 'All'), 'All') AS area_name,
            item_name AS name_1,
            SUM(sum_amount) AS total_amount,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(area_name, 'All'), 'All')
              ORDER BY SUM(sum_amount) DESC
            ) AS rn
          FROM odg_sale_detail
          WHERE yeardoc = '2025'
            AND TO_CHAR(doc_date, 'MM') = TO_CHAR(CURRENT_DATE, 'MM')
          GROUP BY COALESCE(NULLIF(area_name, 'All'), 'All'), item_name
        )
        SELECT area_name, name_1, total_amount
        FROM ranked WHERE rn <= 10;
      `;

    const [year, quarter, month] = await Promise.all([
      fetchTop10ByScope(sql_year_product),
      fetchTop10ByScope(sql_quarter_product),
      fetchTop10ByScope(sql_month_product)
    ]);

    res.json({ year, quarter, month });

  } catch (err) {
    console.error('Error fetching top products by area:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/sales/area', async (req, res) => {
  try {
    const queryThisMonth = `
        SELECT
          area.area_code,
          COALESCE(target.target_amount, 0) AS target_amount,
          COALESCE(rev2025.revenue, 0) AS revenue,
          COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
        FROM (
          SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
          FROM odg_sale_detail
          WHERE yeardoc IN ('2024', '2025') AND monthdoc = TO_CHAR(current_date, 'MM')::int
          UNION
          SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
          FROM odg_target
          WHERE year_part = '2025' AND month_part = TO_CHAR(current_date, 'MM')
        ) area
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
          FROM odg_target
          WHERE year_part = '2025' AND month_part = TO_CHAR(current_date, 'MM')
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) target ON area.area_code = target.area_code
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
          FROM odg_sale_detail
          WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) rev2025 ON area.area_code = rev2025.area_code
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
          FROM odg_sale_detail
          WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) rev2024 ON area.area_code = rev2024.area_code
        ORDER BY area.area_code;
      `;

    const queryLastMonth = `
        SELECT
          area.area_code,
          COALESCE(target.target_amount, 0) AS target_amount,
          COALESCE(rev2025.revenue, 0) AS revenue,
          COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
        FROM (
          SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
          FROM odg_sale_detail
          WHERE yeardoc IN ('2024', '2025') AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1
          UNION
          SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
          FROM odg_target
          WHERE year_part = '2025' AND month_part::int = TO_CHAR(current_date, 'MM')::int - 1
        ) area
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
          FROM odg_target
          WHERE year_part = '2025' AND month_part::int = TO_CHAR(current_date, 'MM')::int - 1
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) target ON area.area_code = target.area_code
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
          FROM odg_sale_detail
          WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) rev2025 ON area.area_code = rev2025.area_code
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
          FROM odg_sale_detail
          WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) rev2024 ON area.area_code = rev2024.area_code
        ORDER BY area.area_code;
      `;

    const queryFullYear = `
        SELECT
          area.area_code,
          COALESCE(target.target_amount, 0) AS target_amount,
          COALESCE(rev2025.revenue, 0) AS revenue,
          COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
        FROM (
          SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
          FROM odg_sale_detail
          WHERE yeardoc IN ('2024', '2025')
          UNION
          SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
          FROM odg_target
          WHERE year_part = '2025'
        ) area
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
          FROM odg_target
          WHERE year_part = '2025'
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) target ON area.area_code = target.area_code
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
          FROM odg_sale_detail
          WHERE yeardoc = '2025'
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) rev2025 ON area.area_code = rev2025.area_code
        LEFT JOIN (
          SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
          FROM odg_sale_detail
          WHERE yeardoc = '2024'
          GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
        ) rev2024 ON area.area_code = rev2024.area_code
        ORDER BY area.area_code;
      `;

    const [thisMonth, lastMonth, fullyear] = await Promise.all([
      pool.query(queryThisMonth),
      pool.query(queryLastMonth),
      pool.query(queryFullYear)
    ]);

    res.json({
      thisMonth: thisMonth.rows,
      lastMonth: lastMonth.rows,
      fullyear: fullyear.rows
    });

  } catch (err) {
    console.error('Error fetching sales area data:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/sales/newcustomer', async (req, res) => {
  try {
    const queryByMonth = `
        WITH months AS (
          SELECT LPAD(generate_series(1, 12)::text, 2, '0') AS month_part
        ),
        customer_sales AS (
          SELECT
            TO_CHAR(a.create_date_time_now, 'MM') AS month_part,
            COUNT(a.code) AS customer_count,
            SUM((
              SELECT COALESCE(SUM(t.total_amount), 0)
              FROM ic_trans t
              WHERE t.cust_code = a.code
            )) AS total
          FROM ar_customer a
          WHERE TO_CHAR(a.create_date_time_now, 'YYYY') = '2025'
          GROUP BY TO_CHAR(a.create_date_time_now, 'MM')
        )
        SELECT
          m.month_part,
          COALESCE(cs.total, 0) AS total_amount,
          COALESCE(cs.customer_count, 0) AS count_customer
        FROM months m
        LEFT JOIN customer_sales cs ON m.month_part = cs.month_part
        ORDER BY m.month_part;
      `;

    const queryByQuarter = `
        WITH quarters AS (
          SELECT 'Q1' AS quarter UNION ALL SELECT 'Q2' UNION ALL SELECT 'Q3' UNION ALL SELECT 'Q4'
        ),
        customer_sales AS (
          SELECT
            CASE
              WHEN EXTRACT(MONTH FROM a.create_date_time_now) BETWEEN 1 AND 3 THEN 'Q1'
              WHEN EXTRACT(MONTH FROM a.create_date_time_now) BETWEEN 4 AND 6 THEN 'Q2'
              WHEN EXTRACT(MONTH FROM a.create_date_time_now) BETWEEN 7 AND 9 THEN 'Q3'
              WHEN EXTRACT(MONTH FROM a.create_date_time_now) BETWEEN 10 AND 12 THEN 'Q4'
            END AS quarter,
            COUNT(a.code) AS customer_count,
            SUM((
              SELECT COALESCE(SUM(t.total_amount), 0)
              FROM ic_trans t
              WHERE t.cust_code = a.code
            )) AS total
          FROM ar_customer a
          WHERE TO_CHAR(a.create_date_time_now, 'YYYY') = '2025'
          GROUP BY quarter
        )
        SELECT
          q.quarter,
          COALESCE(cs.total, 0) AS total_amount,
          COALESCE(cs.customer_count, 0) AS count_customer
        FROM quarters q
        LEFT JOIN customer_sales cs ON q.quarter = cs.quarter
        ORDER BY q.quarter;
      `;

    const queryTotal = `
        SELECT SUM(total) AS total, COUNT(code) AS count_cust_code FROM (
          SELECT TO_CHAR(create_date_time_now, 'MM') AS month_part, code, name_1,
            (SELECT SUM(total_amount) FROM ic_trans WHERE cust_code = a.code) AS total
          FROM ar_customer a
          WHERE TO_CHAR(create_date_time_now, 'yyyy') = '2025'
          GROUP BY TO_CHAR(create_date_time_now, 'MM'), code
        ) AS z;
      `;

    const [bymonth, byq, total] = await Promise.all([
      pool.query(queryByMonth),
      pool.query(queryByQuarter),
      pool.query(queryTotal),
    ]);

    res.json({
      bymonth: bymonth.rows,
      byq: byq.rows,
      total: total.rows[0]
    });

  } catch (err) {
    console.error('Error fetching new customer stats:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/sales/province', async (req, res) => {
  try {
    const thisMonthQuery = `
        SELECT province_name,
          SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
          SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
        FROM odg_sale_detail
        WHERE yeardoc IN ('2025', '2024') 
          AND monthdoc = TO_CHAR(current_date, 'MM')::int
        GROUP BY province_name
        ORDER BY this_year DESC;
      `;

    const lastMonthQuery = `
        SELECT province_name,
          SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
          SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
        FROM odg_sale_detail
        WHERE yeardoc IN ('2025', '2024') 
          AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1
        GROUP BY province_name
        ORDER BY this_year DESC;
      `;

    const fullYearQuery = `
        SELECT province_name,
          SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
          SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
        FROM odg_sale_detail
        WHERE yeardoc IN ('2025', '2024')
        GROUP BY province_name
        ORDER BY this_year DESC;
      `;

    const [thisMonth, lastMonth, fullyear] = await Promise.all([
      pool.query(thisMonthQuery),
      pool.query(lastMonthQuery),
      pool.query(fullYearQuery)
    ]);

    res.json({
      thisMonth: thisMonth.rows,
      lastMonth: lastMonth.rows,
      fullyear: fullyear.rows
    });

  } catch (err) {
    console.error('Error fetching province sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/sales/salemap', async (req, res) => {
  try {
    const query = `
      WITH total_sales AS (
  SELECT province, SUM(sum_amount) AS total
  FROM odg_sale_detail
  WHERE yeardoc = '2025'
  GROUP BY province
),

top_customers AS (
  SELECT *
  FROM (
    SELECT 
      province, 
      customername, 
      SUM(sum_amount) AS total_amount,
      RANK() OVER (PARTITION BY province ORDER BY SUM(sum_amount) DESC) AS rnk
    FROM odg_sale_detail
    GROUP BY province, customername
  ) t
  WHERE rnk <= 10
),

top_products AS (
  SELECT *
  FROM (
    SELECT 
      province, 
      item_name, 
      SUM(sum_amount) AS total_amount,
      RANK() OVER (PARTITION BY province ORDER BY SUM(sum_amount) DESC) AS rnk
    FROM odg_sale_detail
    GROUP BY province, item_name
  ) t
  WHERE rnk <= 10
),

customer_json AS (
  SELECT province, json_agg(json_build_object('customername', customername, 'total', total_amount)) AS top10customer
  FROM top_customers
  GROUP BY province
),

product_json AS (
  SELECT province, json_agg(json_build_object('item_name', item_name, 'total', total_amount)) AS top10product
  FROM top_products
  GROUP BY province
)

SELECT 
  p.code,
  p.name_1,
  p.lat,
  p.lng,
  COALESCE(s.total, 0) AS total,
  COALESCE(c.top10customer, '[]') AS top10customer,
  COALESCE(i.top10product, '[]') AS top10product
FROM erp_province p
LEFT JOIN total_sales s ON s.province = p.code
LEFT JOIN customer_json c ON c.province = p.code
LEFT JOIN product_json i ON i.province = p.code
ORDER BY p.code;

      `;

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching sale map:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
// BU

app.get('/api/bu/saletotalbybu/:bu', async (req, res) => {
  const { bu } = req.params;

  try {
    const queryTotalYear = `
        SELECT
          t.target,
          r.revenue,
          l.last_year
        FROM
          (SELECT SUM(targat_amount) AS target
           FROM odg_target
           WHERE year_part = '2025' AND bu = $1) t,
          (SELECT SUM(sum_amount) AS revenue
           FROM odg_sale_detail
           WHERE yeardoc = '2025' AND bu_code = $1) r,
          (SELECT SUM(sum_amount) AS last_year
           FROM odg_sale_detail
           WHERE yeardoc = '2024' AND bu_code = $1) l;
      `;

    const queryTotalAvg = `
        SELECT
          t.target,
          r.revenue,
          l.last_year
        FROM
          (SELECT SUM(targat_amount) AS target
           FROM odg_target
           WHERE year_part = '2025' AND bu = $1
             AND CAST(month_part AS INTEGER) <= EXTRACT(MONTH FROM CURRENT_DATE)) t,
          (SELECT SUM(sum_amount) AS revenue
           FROM odg_sale_detail
           WHERE yeardoc = '2025' AND bu_code = $1
             AND EXTRACT(MONTH FROM doc_date) <= EXTRACT(MONTH FROM CURRENT_DATE)) r,
          (SELECT SUM(sum_amount) AS last_year
           FROM odg_sale_detail
           WHERE yeardoc = '2024' AND bu_code = $1
             AND EXTRACT(MONTH FROM doc_date) <= EXTRACT(MONTH FROM CURRENT_DATE)) l;
      `;

    const queryTotalMonth = `
        SELECT
          t.target,
          r.revenue,
          l.last_year
        FROM
          (SELECT SUM(targat_amount) AS target
           FROM odg_target
           WHERE year_part = '2025' AND bu = $1
             AND CAST(month_part AS INTEGER) = EXTRACT(MONTH FROM CURRENT_DATE)) t,
          (SELECT SUM(sum_amount) AS revenue
           FROM odg_sale_detail
           WHERE yeardoc = '2025' AND bu_code = $1
             AND EXTRACT(MONTH FROM doc_date) = EXTRACT(MONTH FROM CURRENT_DATE)) r,
          (SELECT SUM(sum_amount) AS last_year
           FROM odg_sale_detail
           WHERE yeardoc = '2024' AND bu_code = $1
             AND EXTRACT(MONTH FROM doc_date) = EXTRACT(MONTH FROM CURRENT_DATE)) l;
      `;

    const [year, avg, month] = await Promise.all([
      pool.query(queryTotalYear, [bu]),
      pool.query(queryTotalAvg, [bu]),
      pool.query(queryTotalMonth, [bu])
    ]);

    res.json({
      total_year: year.rows[0],
      total_avg: avg.rows[0],
      total_month: month.rows[0]
    });

  } catch (err) {
    console.error('Error fetching sale data by BU:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/bu/top-customersbybu/:bu', async (req, res) => {
  const { bu } = req.params;

  try {
    const queryYear = `
        SELECT customername AS cust_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1 
        GROUP BY customername 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryLastMonth = `
        SELECT customername AS cust_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1 
          AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1 
        GROUP BY customername 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryMonth = `
        SELECT customername AS cust_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1 
          AND monthdoc = TO_CHAR(current_date, 'MM')::int 
        GROUP BY customername 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const [year, lastmonth, month] = await Promise.all([
      pool.query(queryYear, [bu]),
      pool.query(queryLastMonth, [bu]),
      pool.query(queryMonth, [bu])
    ]);

    res.json({
      year: year.rows,
      lastmonth: lastmonth.rows,
      month: month.rows
    });

  } catch (err) {
    console.error('Error fetching top customers by BU:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/bu/top-productbybu/:bu', async (req, res) => {
  const { bu } = req.params;

  try {
    const queryYear = `
        SELECT item_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1 
        GROUP BY item_name 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryLastMonth = `
        SELECT item_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1 
          AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1 
        GROUP BY item_name 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryMonth = `
        SELECT item_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1 
          AND monthdoc = TO_CHAR(current_date, 'MM')::int 
        GROUP BY item_name 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const [year, lastmonth, month] = await Promise.all([
      pool.query(queryYear, [bu]),
      pool.query(queryLastMonth, [bu]),
      pool.query(queryMonth, [bu])
    ]);

    res.json({
      year: year.rows,
      lastmonth: lastmonth.rows,
      month: month.rows
    });

  } catch (err) {
    console.error('Error fetching top products by BU:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/bu/quarterly/:bu', async (req, res) => {
  const bu = req.params.bu; // 👈 Extract bu from the URL

  try {
    const query = `
        WITH target_data AS (
          SELECT
            'Q' || CEIL(month_part::int / 3.0) AS quarter,
            SUM(targat_amount) AS target
          FROM odg_target
          WHERE year_part = '2025' AND bu = $1
          GROUP BY CEIL(month_part::int / 3.0)
        ),
        revenue_data AS (
          SELECT
            'Q' || EXTRACT(QUARTER FROM doc_date) AS quarter,
            SUM(sum_amount) AS revenue
          FROM odg_sale_detail
          WHERE bu_code = $2 AND yeardoc = '2025'
          GROUP BY EXTRACT(QUARTER FROM doc_date)
        ),
        last_year_data AS (
          SELECT
            'Q' || EXTRACT(QUARTER FROM doc_date) AS quarter,
            SUM(sum_amount) AS last_year
          FROM odg_sale_detail
          WHERE bu_code = $3 AND yeardoc = '2024'
          GROUP BY EXTRACT(QUARTER FROM doc_date)
        )
  
        SELECT 
          COALESCE(t.quarter, r.quarter, l.quarter) AS quarter,
          COALESCE(t.target, 0) AS target,
          COALESCE(r.revenue, 0) AS revenue,
          COALESCE(l.last_year, 0) AS last_year
        FROM target_data t
        FULL OUTER JOIN revenue_data r ON t.quarter = r.quarter
        FULL OUTER JOIN last_year_data l ON COALESCE(t.quarter, r.quarter) = l.quarter
        ORDER BY quarter;
      `;

    const result = await pool.query(query, [bu, bu, bu]);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching quarterly sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ✅ GET /bu/quarterly/:bu
app.get("/api/bu/quarterly/:bu", async (req, res) => {
  const { bu } = req.params;
  const client = await pool.connect();
  try {
    const result = await client.query(`
      WITH target_data AS (
        SELECT
          'Q' || CEIL(month_part::int / 3.0) AS quarter,
          SUM(targat_amount) AS target
        FROM odg_target
        WHERE year_part = '2025' AND bu = $1
        GROUP BY CEIL(month_part::int / 3.0)
      ),
      revenue_data AS (
        SELECT
          'Q' || EXTRACT(QUARTER FROM doc_date) AS quarter,
          SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE bu_code = $1 AND yeardoc = '2025'
        GROUP BY EXTRACT(QUARTER FROM doc_date)
      ),
      last_year_data AS (
        SELECT
          'Q' || EXTRACT(QUARTER FROM doc_date) AS quarter,
          SUM(sum_amount) AS last_year
        FROM odg_sale_detail
        WHERE bu_code = $1 AND yeardoc = '2024'
        GROUP BY EXTRACT(QUARTER FROM doc_date)
      )
      SELECT 
        COALESCE(t.quarter, r.quarter, l.quarter) AS quarter,
        COALESCE(t.target, 0) AS target,
        COALESCE(r.revenue, 0) AS revenue,
        COALESCE(l.last_year, 0) AS last_year
      FROM target_data t
      FULL OUTER JOIN revenue_data r ON t.quarter = r.quarter
      FULL OUTER JOIN last_year_data l ON COALESCE(t.quarter, r.quarter) = l.quarter
      ORDER BY quarter;
    `, [bu]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  } finally {
    client.release();
  }
});

// ✅ GET /bu/monthly/:bu
app.get("/api/bu/monthly/:bu", async (req, res) => {
  const { bu } = req.params;
  const client = await pool.connect();
  try {
    const result = await client.query(`
      WITH target_data AS (
        SELECT 
          LPAD(month_part::text, 2, '0') AS month,
          SUM(targat_amount) AS target
        FROM odg_target
        WHERE year_part = '2025' AND bu = $1
        GROUP BY month_part
      ),
      revenue_data AS (
        SELECT 
          LPAD(monthdoc::text, 2, '0') AS month,
          SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND bu_code = $1
        GROUP BY monthdoc
      ),
      last_year_data AS (
        SELECT 
          LPAD(monthdoc::text, 2, '0') AS month,
          SUM(sum_amount) AS last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' AND bu_code = $1
        GROUP BY monthdoc
      )
      SELECT 
        COALESCE(t.month, r.month, l.month) AS month,
        COALESCE(t.target, 0) AS target,
        COALESCE(r.revenue, 0) AS revenue,
        COALESCE(l.last_year, 0) AS last_year
      FROM target_data t
      FULL OUTER JOIN revenue_data r ON t.month = r.month
      FULL OUTER JOIN last_year_data l ON COALESCE(t.month, r.month) = l.month
      ORDER BY month;
    `, [bu]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  } finally {
    client.release();
  }
});

// 📡 GET /api/login-logs
// 📡 GET /api/login-logs
app.get('/api/login-logs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, login_time, device_id, ip_address
      FROM public.login_logs_saledb
      ORDER BY login_time DESC
      LIMIT 100
    `);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching login logs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/bu/area/:bu', async (req, res) => {
  const { bu } = req.params;
  try {
    const queryThisMonth = `
      SELECT
        area.area_code,
        COALESCE(target.target_amount, 0) AS target_amount,
        COALESCE(rev2025.revenue, 0) AS revenue,
        COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_sale_detail
        WHERE yeardoc IN ('2024', '2025') AND monthdoc = TO_CHAR(current_date, 'MM')::int  and bu_code=$1
        UNION 
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_target
        WHERE year_part = '2025' AND month_part = TO_CHAR(current_date, 'MM')  and bu=$2
      ) area
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
        FROM odg_target
        WHERE year_part = '2025' AND month_part = TO_CHAR(current_date, 'MM') and bu=$3
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int and bu_code=$4
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int and bu_code=$5
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code;
    `;

    const queryLastMonth = `
      SELECT
        area.area_code,
        COALESCE(target.target_amount, 0) AS target_amount,
        COALESCE(rev2025.revenue, 0) AS revenue,
        COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_sale_detail
        WHERE yeardoc IN ('2024', '2025') AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1  and bu_code=$1
        UNION
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_target
        WHERE year_part = '2025' AND month_part::int = TO_CHAR(current_date, 'MM')::int - 1  and bu=$2
      ) area
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
        FROM odg_target
        WHERE year_part = '2025' AND month_part::int = TO_CHAR(current_date, 'MM')::int - 1  and bu=$3
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1  and bu_code=$4
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1  and bu_code=$5
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code;
    `;

    const queryFullYear = `
      SELECT
        area.area_code,
        COALESCE(target.target_amount, 0) AS target_amount,
        COALESCE(rev2025.revenue, 0) AS revenue,
        COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_sale_detail
        WHERE yeardoc IN ('2024', '2025')
        UNION
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_target
        WHERE year_part = '2025' and bu=$1
      ) area
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
        FROM odg_target
        WHERE year_part = '2025' and bu=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' and bu_code=$3
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' and bu_code=$4
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code;
    `;

    const [thisMonth, lastMonth, fullyear] = await Promise.all([
      pool.query(queryThisMonth, [bu, bu, bu, bu, bu]),
      pool.query(queryLastMonth, [bu, bu, bu, bu, bu]),
      pool.query(queryFullYear, [bu, bu, bu, bu])
    ]);

    res.json({
      thisMonth: thisMonth.rows,
      lastMonth: lastMonth.rows,
      fullyear: fullyear.rows
    });

  } catch (err) {
    console.error('Error fetching sales area data:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
app.get('/api/bu/area-top-customers/:bu_code', async (req, res) => {
  const buCode = req.params.bu_code;

  try {
    const query = `
    WITH 
      current_month AS (SELECT TO_CHAR(current_date, 'MM')::int AS cm),
      last_month AS (SELECT (TO_CHAR(current_date, 'MM')::int - 1) AS lm),

      -- 📌 รวมยอด Fullyear
      full_year_top AS (
        SELECT area_code, customername, SUM(sum_amount) AS total_amount
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND bu_code = $1
        GROUP BY area_code, customername
      ),

      -- 📌 รวมยอด Last Month
      last_month_top AS (
        SELECT s.area_code, s.customername, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, last_month lm
        WHERE s.yeardoc = '2025' AND s.monthdoc = lm.lm AND s.bu_code = $1
        GROUP BY s.area_code, s.customername
      ),

      -- 📌 รวมยอด This Month
      this_month_top AS (
        SELECT s.area_code, s.customername, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, current_month cm
        WHERE s.yeardoc = '2025' AND s.monthdoc = cm.cm AND s.bu_code = $1
        GROUP BY s.area_code, s.customername
      )

    SELECT 
      a.code,
      a.name_1,

      -- 🔹 Fullyear top 10
      (
        SELECT json_agg(t ORDER BY t.total_amount DESC)
        FROM (
          SELECT customername, total_amount
          FROM full_year_top
          WHERE area_code = a.code
          ORDER BY total_amount DESC
          LIMIT 10
        ) t
      ) AS fullyear,

      -- 🔹 Last month top 10
      (
        SELECT json_agg(t ORDER BY t.total_amount DESC)
        FROM (
          SELECT customername, total_amount
          FROM last_month_top
          WHERE area_code = a.code
          ORDER BY total_amount DESC
          LIMIT 10
        ) t
      ) AS last_month,

      -- 🔹 This month top 10
      (
        SELECT json_agg(t ORDER BY t.total_amount DESC)
        FROM (
          SELECT customername, total_amount
          FROM this_month_top
          WHERE area_code = a.code
          ORDER BY total_amount DESC
          LIMIT 10
        ) t
      ) AS this_month

    FROM ar_sale_area a;
    `;

    const result = await pool.query(query, [buCode]); // ✅ inject buCode here
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error loading top customers by area:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/bu/area-top-product/:bu_code', async (req, res) => {
  const buCode = req.params.bu_code;

  try {
    const query = `
    WITH 
      current_month AS (SELECT TO_CHAR(current_date, 'MM')::int AS cm),
      last_month AS (SELECT (TO_CHAR(current_date, 'MM')::int - 1) AS lm),

      -- 📌 Fullyear
      full_year_top AS (
        SELECT area_code, item_name, SUM(sum_amount) AS total_amount
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND bu_code = $1
        GROUP BY area_code, item_name
      ),

      -- 📌 Last Month
      last_month_top AS (
        SELECT s.area_code, s.item_name, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, last_month lm
        WHERE s.yeardoc = '2025' AND s.monthdoc = lm.lm AND s.bu_code = $1
        GROUP BY s.area_code, s.item_name
      ),

      -- 📌 This Month
      this_month_top AS (
        SELECT s.area_code, s.item_name, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, current_month cm
        WHERE s.yeardoc = '2025' AND s.monthdoc = cm.cm AND s.bu_code = $1
        GROUP BY s.area_code, s.item_name
      )

    SELECT 
      a.code,
      a.name_1,

      -- 🔹 Fullyear top 10
      (
        SELECT json_agg(t ORDER BY t.total_amount DESC)
        FROM (
          SELECT item_name, total_amount
          FROM full_year_top
          WHERE area_code = a.code
          ORDER BY total_amount DESC
          LIMIT 10
        ) t
      ) AS fullyear,

      -- 🔹 Last month top 10
      (
        SELECT json_agg(t ORDER BY t.total_amount DESC)
        FROM (
          SELECT item_name, total_amount
          FROM last_month_top
          WHERE area_code = a.code
          ORDER BY total_amount DESC
          LIMIT 10
        ) t
      ) AS last_month,

      -- 🔹 This month top 10
      (
        SELECT json_agg(t ORDER BY t.total_amount DESC)
        FROM (
          SELECT item_name, total_amount
          FROM this_month_top
          WHERE area_code = a.code
          ORDER BY total_amount DESC
          LIMIT 10
        ) t
      ) AS this_month

    FROM ar_sale_area a;
    `;

    const result = await pool.query(query, [buCode]); // ✅ buCode passed safely
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error loading top products by area:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/api/bu/province/:bu_code', async (req, res) => {
  const buCode = req.params.bu_code;

  try {
    const thisMonthQuery = `
      SELECT province_name,
        SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
        SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
      FROM odg_sale_detail
      WHERE yeardoc IN ('2025', '2024') 
        AND bu_code = $1
        AND monthdoc = TO_CHAR(current_date, 'MM')::int
      GROUP BY province_name
      ORDER BY this_year DESC;
    `;

    const lastMonthQuery = `
      SELECT province_name,
        SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
        SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
      FROM odg_sale_detail
      WHERE yeardoc IN ('2025', '2024') 
        AND bu_code = $1
        AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1
      GROUP BY province_name
      ORDER BY this_year DESC;
    `;

    const fullYearQuery = `
      SELECT province_name,
        SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
        SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
      FROM odg_sale_detail
      WHERE yeardoc IN ('2025', '2024') 
        AND bu_code = $1
      GROUP BY province_name
      ORDER BY this_year DESC;
    `;

    const [thisMonth, lastMonth, fullyear] = await Promise.all([
      pool.query(thisMonthQuery, [buCode]),
      pool.query(lastMonthQuery, [buCode]),
      pool.query(fullYearQuery, [buCode])
    ]);

    res.json({
      thisMonth: thisMonth.rows,
      lastMonth: lastMonth.rows,
      fullyear: fullyear.rows
    });

  } catch (err) {
    console.error('❌ Error fetching province sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/bu/salemapbybu/:bu_code', async (req, res) => {
  const buCode = req.params.bu_code;

  try {
    const query = `
WITH total_sales AS (
  SELECT province, SUM(sum_amount) AS total
  FROM odg_sale_detail
  WHERE yeardoc = '2025' AND bu_code = $1
  GROUP BY province
),

top_customers AS (
  SELECT province, json_agg(t) AS top10customer
  FROM (
    SELECT province, customername, SUM(sum_amount) AS total_amount,
           RANK() OVER (PARTITION BY province ORDER BY SUM(sum_amount) DESC) AS rnk
    FROM odg_sale_detail
    WHERE bu_code = $1
    GROUP BY province, customername
  ) t
  WHERE t.rnk <= 10
  GROUP BY province
),

top_products AS (
  SELECT province, json_agg(t) AS top10product
  FROM (
    SELECT province, item_name, SUM(sum_amount) AS total_amount,
           RANK() OVER (PARTITION BY province ORDER BY SUM(sum_amount) DESC) AS rnk
    FROM odg_sale_detail
    WHERE bu_code = $1
    GROUP BY province, item_name
  ) t
  WHERE t.rnk <= 10
  GROUP BY province
)

SELECT 
  p.code,
  p.name_1,
  p.lat,
  p.lng,
  COALESCE(s.total, 0) AS total,
  COALESCE(c.top10customer, '[]') AS top10customer,
  COALESCE(i.top10product, '[]') AS top10product
FROM erp_province p
LEFT JOIN total_sales s ON s.province = p.code
LEFT JOIN top_customers c ON c.province = p.code
LEFT JOIN top_products i ON i.province = p.code
ORDER BY p.code;

    `;

    const result = await pool.query(query, [buCode]);
    res.json(result.rows);

  } catch (err) {
    console.error('❌ Error fetching sale map:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
// app.get('/api/sales/salewithcost', async (req, res) => {
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 20;
//   const offset = (page - 1) * limit;
//   const groupMain = req.query.groupMain || '';

//   // Dynamically add filter
//   let whereClause = `WHERE yeardoc = '2025'`;
//   const params = [];
//   if (groupMain) {
//     whereClause += ` AND itemmaingroup = $1`;
//     params.push(groupMain);
//   }

//   const baseQuery = `
//     SELECT
//       itemmaingroup,
//       itemsubgroup,
//       itemsubgroup2,
//       item_code,
//       item_name,
//       SUM(qty) AS qty,
//       unit_code,
//       SUM(sum_amount) AS sale_amount,
//       SUM(
//         CASE 
//           WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
//           THEN cost_thb_pakse 
//           ELSE cost_thb_vte 
//         END
//       ) AS total_cost
//     FROM odg_sale_detail
//     ${whereClause}
//     GROUP BY item_code, item_name, itemmaingroup, itemsubgroup, itemsubgroup2, unit_code
//   `;

//   const paginatedQuery = `
//     SELECT * FROM (
//       ${baseQuery}
//     ) AS sub
//     LIMIT $${params.length + 1} OFFSET $${params.length + 2}
//   `;

//   const countQuery = `
//     SELECT COUNT(*) FROM (
//       ${baseQuery}
//     ) AS count_table
//   `;

//   try {
//     const [dataResult, countResult] = await Promise.all([
//       pool.query(paginatedQuery, [...params, limit, offset]),
//       pool.query(countQuery, params),
//     ]);

//     const total = parseInt(countResult.rows[0].count);
//     const totalPages = Math.ceil(total / limit);

//     res.json({
//       success: true,
//       currentPage: page,
//       totalPages,
//       totalRecords: total,
//       data: dataResult.rows,
//     });
//   } catch (err) {
//     console.error('Error executing query', err.stack);
//     res.status(500).json({ success: false, message: 'Query failed', error: err.message });
//   }
// });

app.get('/api/sales/salewithcost', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const { groupMain, groupSub, groupSub2 } = req.query;

  let whereClause = `WHERE yeardoc = '2025'`;
  const params = [];
  let paramIndex = 1;

  if (groupMain) {
    whereClause += ` AND itemmaingroup = $${paramIndex++}`;
    params.push(groupMain);
  }
  if (groupSub) {
    whereClause += ` AND itemsubgroup = $${paramIndex++}`;
    params.push(groupSub);
  }
  if (groupSub2) {
    whereClause += ` AND itemsubgroup2 = $${paramIndex++}`;
    params.push(groupSub2);
  }

  const baseQuery = `
    SELECT
      itemmaingroup,
      itemsubgroup,
      itemsubgroup2,
      item_code,
      item_name,
      SUM(qty) AS qty,
      unit_code,
      SUM(sum_amount) AS sale_amount,
      SUM(qty*
        CASE 
          WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
          THEN cost_thb_pakse 
          ELSE cost_thb_vte 
        END
      ) AS total_cost,
      CASE 
        WHEN SUM(qty*
          CASE 
            WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
            THEN cost_thb_pakse 
            ELSE cost_thb_vte 
          END
        ) = 0 THEN 0
        ELSE 
          SUM(sum_amount) - SUM(qty*
            CASE 
              WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
              THEN cost_thb_pakse 
              ELSE cost_thb_vte 
            END
          )
      END AS gm,
      	  	 to_char(min(doc_date),'dd-MM-yyyy') as first_sale,
	 to_char(max(doc_date),'dd-MM-yyyy') as last_sale
    FROM odg_sale_detail
    ${whereClause}
    GROUP BY item_code, item_name, itemmaingroup, itemsubgroup, itemsubgroup2, unit_code
  `;

  const paginatedQuery = `
    SELECT * FROM (
      ${baseQuery}
    ) AS sub
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const countQuery = `
    SELECT COUNT(*) FROM (
      ${baseQuery}
    ) AS count_table
  `;

  try {
    const [dataResult, countResult] = await Promise.all([
      pool.query(paginatedQuery, [...params, limit, offset]),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      currentPage: page,
      totalPages,
      totalRecords: total,
      data: dataResult.rows,
    });
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ success: false, message: 'Query failed', error: err.message });
  }
});

app.get('/api/sales/countcost', async (req, res) => {
  try {
    const total_query = `
      SELECT 
        COUNT(*) AS total_items,
        COUNT(*) FILTER (
          WHERE total_cost = 0
        ) AS zero_cost_items
      FROM (
        SELECT item_code,
               SUM(qty*CASE 
                 WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
                 THEN cost_thb_pakse 
                 ELSE cost_thb_vte 
               END) AS total_cost
        FROM odg_sale_detail
        WHERE yeardoc = '2025'
          AND maingroup_code IN ('11','12','13','14')
        GROUP BY item_code
      ) AS sub;
    `;

    const main_query = `
      SELECT 
        itemmaingroup,
        COUNT(*) AS total_items,
        COUNT(*) FILTER (
          WHERE total_cost = 0
        ) AS zero_cost_items
      FROM (
        SELECT itemmaingroup,
               item_code,
               SUM(qty*CASE 
                 WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
                 THEN cost_thb_pakse 
                 ELSE cost_thb_vte 
               END) AS total_cost
        FROM odg_sale_detail
        WHERE yeardoc = '2025'
          AND maingroup_code IN ('11','12','13','14')
        GROUP BY itemmaingroup, item_code
      ) AS sub
      GROUP BY itemmaingroup
      ORDER BY itemmaingroup;
    `;

    const [total, bygroup] = await Promise.all([
      pool.query(total_query),
      pool.query(main_query),
    ]);

    res.json({
      total: total.rows,
      bygroupmain: bygroup.rows,
    });
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ success: false, message: 'Query failed', error: err.message });
  }
});
// GET /api/sales/groupnames
app.get('/api/sales/groupmain', async (req, res) => {
  try {
    const query = `
      SELECT code, name_1
      FROM ic_group
      WHERE code IN ('11','12','13','14')
      ORDER BY code;
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching group names:', err);
    res.status(500).json({ success: false, message: 'Query failed', error: err.message });
  }
});
// GET /api/sales/groupsub?main=11
app.get('/api/sales/groupsub', async (req, res) => {
  const mainGroup = req.query.main;

  if (!mainGroup) {
    return res.status(400).json({ success: false, message: "Missing 'main' group parameter" });
  }

  const query = `
    SELECT code, name_1
    FROM ic_group_sub
    WHERE main_group = $1
    ORDER BY code
  `;

  try {
    const result = await pool.query(query, [mainGroup]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching subgroups:', err.stack);
    res.status(500).json({ success: false, message: 'Query failed', error: err.message });
  }
});

// GET /api/sales/groupsub2?main=11&sub=1101
app.get('/api/sales/groupsub2', async (req, res) => {
  const main = req.query.main;
  const sub = req.query.sub;

  if (!main || !sub) {
    return res.status(400).json({ success: false, message: "Missing 'main' or 'sub' parameter" });
  }

  const query = `
    SELECT code, name_1
    FROM ic_group_sub2
    WHERE main_group = $1 AND ic_group_sub_code = $2
    ORDER BY code
  `;

  try {
    const result = await pool.query(query, [main, sub]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Error fetching group sub2:', err.stack);
    res.status(500).json({ success: false, message: 'Query failed', error: err.message });
  }
});


app.get('/api/sales/salewithcost-zero', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const isExport = req.query.export === '1'; // 👈 check export mode

  const { groupMain, groupSub, groupSub2 } = req.query;

  let whereClause = `WHERE yeardoc = '2025'`;
  const params = [];
  let paramIndex = 1;

  if (groupMain) {
    whereClause += ` AND itemmaingroup = $${paramIndex++}`;
    params.push(groupMain);
  }
  if (groupSub) {
    whereClause += ` AND itemsubgroup = $${paramIndex++}`;
    params.push(groupSub);
  }
  if (groupSub2) {
    whereClause += ` AND itemsubgroup2 = $${paramIndex++}`;
    params.push(groupSub2);
  }

  const baseQuery = `
    SELECT
      itemmaingroup,
      itemsubgroup,
      itemsubgroup2,
      item_code,
      item_name,
      SUM(qty) AS qty,
      unit_code,
      SUM(sum_amount) AS sale_amount,
      SUM(
        qty * CASE 
          WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
          THEN COALESCE(cost_thb_pakse, 0)
          ELSE cost_thb_vte 
        END
      ) AS total_cost,
             	  	 to_char(min(doc_date),'dd-MM-yyyy') as first_sale,
       	 to_char(max(doc_date),'dd-MM-yyyy') as last_sale
    FROM odg_sale_detail
    ${whereClause}
    GROUP BY item_code, item_name, itemmaingroup, itemsubgroup, itemsubgroup2, unit_code
    HAVING
      SUM(
        qty * CASE 
          WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
          THEN COALESCE(cost_thb_pakse, 0)
          ELSE cost_thb_vte 
        END
      ) = 0
  `;

  try {
    if (isExport) {
      // ✅ Export mode - return full dataset
      const result = await pool.query(baseQuery, params);
      return res.json(result.rows);
    }

    // ✅ Pagination mode
    const paginatedQuery = `
      SELECT * FROM (
        ${baseQuery}
      ) AS sub
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const countQuery = `
      SELECT COUNT(*) FROM (
        ${baseQuery}
      ) AS count_table
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(paginatedQuery, [...params, limit, offset]),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      currentPage: page,
      totalPages,
      totalRecords: total,
      data: dataResult.rows,
    });
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ success: false, message: 'Query failed', error: err.message });
  }
});
app.get('/api/sales/salewithcost-under', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const isExport = req.query.export === '1';

  const { groupMain, groupSub, groupSub2 } = req.query;

  let whereClause = `WHERE yeardoc = '2025'`;
  const params = [];
  let paramIndex = 1;

  if (groupMain) {
    whereClause += ` AND itemmaingroup = $${paramIndex++}`;
    params.push(groupMain);
  }
  if (groupSub) {
    whereClause += ` AND itemsubgroup = $${paramIndex++}`;
    params.push(groupSub);
  }
  if (groupSub2) {
    whereClause += ` AND itemsubgroup2 = $${paramIndex++}`;
    params.push(groupSub2);
  }

  const baseQuery = `
    SELECT
      itemmaingroup,
      itemsubgroup,
      itemsubgroup2,
      item_code,
      item_name,
      SUM(qty) AS qty,
      unit_code,
      SUM(sum_amount) AS sale_amount,
      SUM(
        qty * CASE 
          WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
          THEN COALESCE(cost_thb_pakse, 0)
          ELSE cost_thb_vte 
        END
      ) AS total_cost,
      CASE 
        WHEN SUM(
          qty * CASE 
            WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
            THEN COALESCE(cost_thb_pakse, 0)
            ELSE cost_thb_vte 
          END
        ) = 0 THEN 0
        ELSE 
          SUM(sum_amount) - SUM(
            qty * CASE 
              WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
              THEN COALESCE(cost_thb_pakse, 0)
              ELSE cost_thb_vte 
            END
          )
      END AS gm,
            	  	 to_char(min(doc_date),'dd-MM-yyyy') as first_sale,
      	 to_char(max(doc_date),'dd-MM-yyyy') as last_sale
    FROM odg_sale_detail
    ${whereClause}
    GROUP BY item_code, item_name, itemmaingroup, itemsubgroup, itemsubgroup2, unit_code
    HAVING
      SUM(sum_amount) - SUM(
        qty * CASE 
          WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
          THEN COALESCE(cost_thb_pakse, 0)
          ELSE cost_thb_vte 
        END
      ) < 0
  `;

  try {
    if (isExport) {
      const result = await pool.query(baseQuery, params);
      return res.json(result.rows);
    }

    const paginatedQuery = `
      SELECT * FROM (
        ${baseQuery}
      ) AS sub
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const countQuery = `
      SELECT COUNT(*) FROM (
        ${baseQuery}
      ) AS count_table
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(paginatedQuery, [...params, limit, offset]),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      currentPage: page,
      totalPages,
      totalRecords: total,
      data: dataResult.rows,
    });
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ success: false, message: 'Query failed', error: err.message });
  }
});

app.get('/api/sales/summarygm', async (req, res) => {
  try {
    const result = await pool.query(`
  SELECT 
  -- ຍອດຂາຍທັງໝົດ
  SUM(sum_amount) AS total_sale_all,

  -- ຍອດຂາຍທີ່ມີຕົ້ນທຶນ
  SUM(
    CASE 
      WHEN COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse) > 0 THEN sum_amount
      ELSE 0
    END
  ) AS total_sale_with_cost,

  -- ✅ ຕົ້ນທຶນລວມ (cost * qty)
  SUM(
    qty * COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse)
  ) AS total_cost,

  -- ✅ ກຳໄລສະເພາະລາຍການທີ່ມີຕົ້ນທຶນ
  SUM(
    CASE 
      WHEN COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse) > 0 THEN
        sum_amount - (qty * COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse))
      ELSE 0
    END
  ) AS total_gm_with_cost,

  -- ຍອດຂາຍທີ່ບໍ່ມີຕົ້ນທຶນ
  SUM(
    CASE 
      WHEN COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse) = 0 THEN sum_amount
      ELSE 0
    END
  ) AS sale_no_cost

FROM odg_sale_detail
WHERE yeardoc = '2025'
  AND maingroup_code IN ('11','12','13','14');


    `);
    const resultbygroup = await pool.query(`
              SELECT 
                itemmaingroup,

                -- ຍອດຂາຍທັງໝົດ
                SUM(sum_amount) AS total_sale_all,

                -- ຍອດຂາຍທີ່ມີຕົ້ນທຶນ
                SUM(
                  CASE 
                    WHEN COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse) > 0 THEN sum_amount
                    ELSE 0
                  END
                ) AS total_sale_with_cost,

                -- ຕົ້ນທຶນລວມ
                SUM(
                  qty * COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse)
                ) AS total_cost,

                -- ກຳໄລສະເພາະລາຍການທີ່ມີຕົ້ນທຶນ
                SUM(
                  CASE 
                    WHEN COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse) > 0 THEN
                      sum_amount - (qty * COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse))
                    ELSE 0
                  END
                ) AS total_gm_with_cost,

                -- ຍອດຂາຍທີ່ບໍ່ມີຕົ້ນທຶນ
                SUM(
                  CASE 
                    WHEN COALESCE(NULLIF(cost_thb_vte, 0), cost_thb_pakse) = 0 THEN sum_amount
                    ELSE 0
                  END
                ) AS sale_no_cost

              FROM odg_sale_detail
              WHERE yeardoc = '2025'
                AND maingroup_code IN ('11','12','13','14')
              GROUP BY itemmaingroup
              ORDER BY itemmaingroup;
    `);
    res.json({
      total: result.rows,
      bygroup: resultbygroup.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});


app.get('/api/sales/item-cost-status', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        item_code,
        item_name,
        CASE 
            WHEN COALESCE(cost_thb_vte, 0) = 0 AND COALESCE(cost_thb_pakse, 0) = 0 THEN 'No Cost'
            ELSE 'Has Cost'
        END AS cost_status,
        SUM(sum_amount) AS total_sale_amount,
        SUM(COALESCE(cost_thb_vte, 0) * qty) AS total_cost_vte,
        SUM(COALESCE(cost_thb_pakse, 0) * qty) AS total_cost_pakse
      FROM odg_sale_detail
      WHERE yeardoc = 2025
        AND item_code IN (
          SELECT item_code
          FROM odg_sale_detail
          WHERE yeardoc = 2025
          GROUP BY item_code
          HAVING 
            COUNT(CASE WHEN COALESCE(cost_thb_vte, 0) = 0 AND COALESCE(cost_thb_pakse, 0) = 0 THEN 1 END) > 0
            AND
            COUNT(CASE WHEN COALESCE(cost_thb_vte, 0) > 0 OR COALESCE(cost_thb_pakse, 0) > 0 THEN 1 END) > 0
        )
      GROUP BY item_code, item_name, cost_status
      ORDER BY item_code, cost_status DESC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Promontion Line O.A


app.get('/api/promotion/total', async (req, res) => {
  try {
    const total_pro = await pool.query(`
                        SELECT
                          COUNT(*) AS total_promotions_2025,
                          COUNT(CASE WHEN to_date < CURRENT_DATE THEN 1 END) AS completed_promotions,
                          COUNT(CASE WHEN to_date >= CURRENT_DATE THEN 1 END) AS active_promotions,
                          (
                            SELECT COUNT(DISTINCT cust_code)
                            FROM odg_pomotion_colection_transection
                            WHERE calc_flag = '1'
                          ) AS total_participating_customers,
                            (
                            SELECT COUNT(DISTINCT cust_code)
                            FROM odg_pomotion_colection_transection
                            WHERE calc_flag = '-1'
                          ) AS total_redeem_customers,
                              (
                            SELECT COUNT(DISTINCT item_code)
                            FROM odg_pomotion_colection_transection
                            WHERE calc_flag = '-1'
                          ) AS total_redeem_lucky
                        FROM public.odg_pomotion_colection_point a
                        WHERE
                          from_date <= '2025-12-31'
                          AND to_date >= '2025-01-01';

    `);
    const total_bypro = await pool.query(`
                        SELECT
                        pro_code,
                        pro_name,
                        from_date,
                        to_date,
                        CASE 
                          WHEN to_date < CURRENT_DATE THEN 'ສິ້ນສຸດແລ້ວ'
                          ELSE 'ກຳລັງດຳເນີນການ'
                        END AS status,
                        
                        COALESCE((
                          SELECT SUM(get_point) 
                          FROM odg_pomotion_colection_transection 
                          WHERE calc_flag = 1 AND pro_code = a.pro_code
                        ), 0) AS get_point,

                        COALESCE((
                          SELECT SUM(get_point) 
                          FROM odg_pomotion_colection_transection 
                          WHERE calc_flag = -1 AND pro_code = a.pro_code
                        ), 0) AS redeem,

                        COALESCE((
                          SELECT SUM(get_point) 
                          FROM odg_pomotion_colection_transection 
                          WHERE calc_flag = 1 AND pro_code = a.pro_code
                        ), 0)
                        -
                        COALESCE((
                          SELECT SUM(get_point) 
                          FROM odg_pomotion_colection_transection 
                          WHERE calc_flag = -1 AND pro_code = a.pro_code
                        ), 0) AS bl_point

                      FROM public.odg_pomotion_colection_point a
                      WHERE
                        from_date <= '2025-12-31'
                        AND to_date >= '2025-01-01'
                      ORDER BY from_date DESC;

    `);
    const product_redeem = await pool.query(`
                    SELECT 
                      item_code,
                      name_1,
                      SUM(a.qty) AS qty,
                      SUM(get_point) AS redeem_point,
                      (SUM(get_point) / SUM(a.qty))::int AS point_avg,
                      unit_cost
                    FROM odg_pomotion_colection_transection a
                    LEFT JOIN ic_inventory b ON b.code = a.item_code 
                    WHERE calc_flag = '-1' 
                    GROUP BY item_code, name_1, unit_cost
                    ORDER BY SUM(qty) DESC;`);
    res.json({
      total: total_pro.rows,
      total_by_pro: total_bypro.rows,
      product_redeem: product_redeem.rows

    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});


app.get('/api/bu/saletotalbybuchannel', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;
  console.log('bu:', bu);
  console.log('dpt:', dpt);
  try {
    const queryTotalYear = `
        SELECT
          t.target,
          r.revenue,
          l.last_year
        FROM
          (SELECT SUM(targat_amount) AS target
           FROM odg_target
           WHERE year_part = '2025' AND bu = $1  and department_code=$2) t,
          (SELECT SUM(sum_amount) AS revenue
           FROM odg_sale_detail
           WHERE yeardoc = '2025' AND bu_code = $1  and department_code=$2) r,
          (SELECT SUM(sum_amount) AS last_year
           FROM odg_sale_detail
           WHERE yeardoc = '2024' AND bu_code = $1  and department_code=$2) l;
      `;

    const queryTotalAvg = `
        SELECT
          t.target,
          r.revenue,
          l.last_year
        FROM
          (SELECT SUM(targat_amount) AS target
           FROM odg_target
           WHERE year_part = '2025' AND bu = $1 and department_code=$2
             AND CAST(month_part AS INTEGER) <= EXTRACT(MONTH FROM CURRENT_DATE)) t,
          (SELECT SUM(sum_amount) AS revenue
           FROM odg_sale_detail
           WHERE yeardoc = '2025' AND bu_code = $1 and department_code=$2
             AND EXTRACT(MONTH FROM doc_date) <= EXTRACT(MONTH FROM CURRENT_DATE)) r,
          (SELECT SUM(sum_amount) AS last_year
           FROM odg_sale_detail
           WHERE yeardoc = '2024' AND bu_code = $1 and department_code=$2
             AND EXTRACT(MONTH FROM doc_date) <= EXTRACT(MONTH FROM CURRENT_DATE)) l;
      `;

    const queryTotalMonth = `
        SELECT
          t.target,
          r.revenue,
          l.last_year
        FROM
          (SELECT SUM(targat_amount) AS target
           FROM odg_target
           WHERE year_part = '2025' AND bu = $1 and department_code=$2
             AND CAST(month_part AS INTEGER) = EXTRACT(MONTH FROM CURRENT_DATE)) t,
          (SELECT SUM(sum_amount) AS revenue
           FROM odg_sale_detail
           WHERE yeardoc = '2025' AND bu_code = $1 and department_code=$2
             AND EXTRACT(MONTH FROM doc_date) = EXTRACT(MONTH FROM CURRENT_DATE)) r,
          (SELECT SUM(sum_amount) AS last_year
           FROM odg_sale_detail
           WHERE yeardoc = '2024' AND bu_code = $1 and department_code=$2
             AND EXTRACT(MONTH FROM doc_date) = EXTRACT(MONTH FROM CURRENT_DATE)) l;
      `;

    const [year, avg, month] = await Promise.all([
      pool.query(queryTotalYear, [bu,dpt]),
      pool.query(queryTotalAvg, [bu,dpt]),
      pool.query(queryTotalMonth, [bu,dpt])
    ]);

    res.json({
      total_year: year.rows[0],
      total_avg: avg.rows[0],
      total_month: month.rows[0]
    });

  } catch (err) {
    console.error('Error fetching sale data by BU:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});



app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
