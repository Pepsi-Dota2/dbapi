const express = require('express');
const router = express.Router();
const pool = require('../db');


router.get('/saletotalbybu/:bu', async (req, res) => {
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


// ✅ GET /bu/top-customersbybu/:bu
router.get('/top-customersbybu/:bu', async (req, res) => {
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

router.get('/top-productbybu/:bu', async (req, res) => {
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

router.get('/quarterly/:bu', async (req, res) => {
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
router.get("/quarterly/:bu", async (req, res) => {
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
router.get("/monthly/:bu", async (req, res) => {
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

router.get('/area/:bu', async (req, res) => {
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


router.get('/area-top-customers/:bu_code', async (req, res) => {
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

router.get('/area-top-product/:bu_code', async (req, res) => {
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


router.get('/province/:bu_code', async (req, res) => {
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

router.get('/salemapbybu/:bu_code', async (req, res) => {
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


router.get('/customer-top-products', async (req, res) => {
  try {
    const { area_name, province , bu_code, page = 1, limit = 5 } = req.query;
    console.log('Query parameters:', req.query);
    if (!bu_code) {
      return res.status(400).json({ error: 'Missing bu_code' });
    }

    const offset = (page - 1) * limit;

    // 1. Query customers with total amount
    const customerQuery = `
      SELECT 
        d.customer_code,
        d.customername AS cust_name,
        MAX(d.doc_date) AS last_buy,
        d.area_name,
        d.province,
        p.name_1 AS province_name,
        SUM(d.sum_amount) AS total_amount
      FROM odg_sale_detail d
      LEFT JOIN erp_province p ON d.province = p.code
      WHERE d.yeardoc = '2025'
        AND d.bu_code = $1
        AND d.area_name ILIKE $2
        AND d.province ILIKE $3
      GROUP BY d.customer_code, d.customername, d.area_name, d.province, p.name_1
      ORDER BY total_amount DESC
      LIMIT $4 OFFSET $5
    `;

    const customerParams = [
      bu_code,
      `%${area_name}%`,
      `%${province}%`,
      limit,
      offset,
    ];

    const customerResult = await pool.query(customerQuery, customerParams);
    const customers = customerResult.rows;

    if (customers.length === 0) {
      return res.json({ data: [], hasMore: false });
    }

    const customerCodes = customers.map((c) => c.customer_code);

    // 2. Top product per customer
    const topProductsQuery = `
      SELECT 
        customer_code, 
        item_name, 
        SUM(sum_amount) AS total_amount,
        SUM(qty) AS qty
      FROM odg_sale_detail
      WHERE yeardoc = '2025'
        AND bu_code = $1
        AND customer_code = ANY($2::text[])
      GROUP BY customer_code, item_name
    `;

    const topProductsResult = await pool.query(topProductsQuery, [
      bu_code,
      customerCodes,
    ]);

    const groupedTopProducts = {};
    topProductsResult.rows.forEach((row) => {
      const code = row.customer_code;
      if (!groupedTopProducts[code]) {
        groupedTopProducts[code] = { amount: [], qty: [] };
      }
      groupedTopProducts[code].amount.push({
        item_name: row.item_name,
        total_amount: Number(row.total_amount),
      });
      groupedTopProducts[code].qty.push({
        item_name: row.item_name,
        qty: Number(row.qty),
      });
    });

    // 3. Merge into customer list
    const final = customers.map((cust) => {
      const top = groupedTopProducts[cust.customer_code] || { amount: [], qty: [] };
      return {
        ...cust,
        total_amount: Number(cust.total_amount),
        top10product_amount: top.amount.sort((a, b) => b.total_amount - a.total_amount).slice(0, 10),
        top10product_qty: top.qty.sort((a, b) => b.qty - a.qty).slice(0, 10),
      };
    });

    // 4. Return paginated result with hasMore
    const hasMore = customers.length === parseInt(limit);
    return res.json({ data: final, hasMore });
  } catch (err) {
    console.error('🔥 Error in /customer-top-products:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
// GET /api/sale-areas
router.get('/sale-areas', async (req, res) => {
  try {
    const result = await pool.query('SELECT code, name_1 FROM ar_sale_area ORDER BY name_1');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sale areas:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/provinces_area', async (req, res) => {
  try {
    const { area_id } = req.query;

    if (!area_id) {
      return res.status(400).json({ error: 'Missing area_id' });
    }

    const result = await pool.query(`SELECT code, name_1
                      FROM erp_province
                      WHERE code = ANY (
                        SELECT unnest(string_to_array(name_2, ','))
                        FROM ar_sale_area
                        WHERE code = $1
                      );`, [area_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error in /common/provinces:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
