const express = require('express');
const router = express.Router();
const pool = require('../db');



router.get('/saletotalbybuchannel', async (req, res) => {
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
      pool.query(queryTotalYear, [bu, dpt]),
      pool.query(queryTotalAvg, [bu, dpt]),
      pool.query(queryTotalMonth, [bu, dpt])
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

router.get('/top-customersbybubychannel', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;
  console.log('bu:', bu);
  console.log('dpt:', dpt);
  try {
    const queryYear = `
        SELECT customername AS cust_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1  and department_code=$2
        GROUP BY customername 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryLastMonth = `
        SELECT customername AS cust_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1  and department_code=$2
          AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1 
        GROUP BY customername 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryMonth = `
        SELECT customername AS cust_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1  and department_code=$2
          AND monthdoc = TO_CHAR(current_date, 'MM')::int 
        GROUP BY customername 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const [year, lastmonth, month] = await Promise.all([
      pool.query(queryYear, [bu, dpt]),
      pool.query(queryLastMonth, [bu, dpt]),
      pool.query(queryMonth, [bu, dpt])
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



router.get('/top-productbybuchannel', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;
  console.log('bu:', bu);
  console.log('dpt:', dpt);

  try {
    const queryYear = `
        SELECT item_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1 and department_code=$2
        GROUP BY item_name 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryLastMonth = `
        SELECT item_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1  and department_code=$2
          AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1 
        GROUP BY item_name 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const queryMonth = `
        SELECT item_name, SUM(sum_amount) AS total_amount 
        FROM odg_sale_detail 
        WHERE yeardoc = '2025' AND bu_code = $1  and department_code=$2
          AND monthdoc = TO_CHAR(current_date, 'MM')::int 
        GROUP BY item_name 
        ORDER BY SUM(sum_amount) DESC 
        LIMIT 10;
      `;

    const [year, lastmonth, month] = await Promise.all([
      pool.query(queryYear, [bu, dpt]),
      pool.query(queryLastMonth, [bu, dpt]),
      pool.query(queryMonth, [bu, dpt])
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


router.get('/quarterly', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;
  console.log('bu:', bu);
  console.log('dpt:', dpt);

  try {
    const query = `
        WITH target_data AS (
          SELECT
            'Q' || CEIL(month_part::int / 3.0) AS quarter,
            SUM(targat_amount) AS target
          FROM odg_target
          WHERE year_part = '2025' AND bu = $1 and department_code=$2
          GROUP BY CEIL(month_part::int / 3.0)
        ),
        revenue_data AS (
          SELECT
            'Q' || EXTRACT(QUARTER FROM doc_date) AS quarter,
            SUM(sum_amount) AS revenue
          FROM odg_sale_detail
          WHERE bu_code = $1 AND yeardoc = '2025' and department_code=$2
          GROUP BY EXTRACT(QUARTER FROM doc_date)
        ),
        last_year_data AS (
          SELECT
            'Q' || EXTRACT(QUARTER FROM doc_date) AS quarter,
            SUM(sum_amount) AS last_year
          FROM odg_sale_detail
          WHERE bu_code = $1 AND yeardoc = '2024' and department_code=$2
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

    const result = await pool.query(query, [bu, dpt]);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching quarterly sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// ✅ GET /bu/monthly/:bu
router.get("/monthly", async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;
  console.log('bu:', bu);
  console.log('dpt:', dpt);
  const client = await pool.connect();
  try {
    const result = await client.query(`
      WITH target_data AS (
        SELECT 
          LPAD(month_part::text, 2, '0') AS month,
          SUM(targat_amount) AS target
        FROM odg_target
        WHERE year_part = '2025' AND bu = $1 and department_code=$2
        GROUP BY month_part
      ),
      revenue_data AS (
        SELECT 
          LPAD(monthdoc::text, 2, '0') AS month,
          SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND bu_code = $1 and department_code=$2
        GROUP BY monthdoc
      ),
      last_year_data AS (
        SELECT 
          LPAD(monthdoc::text, 2, '0') AS month,
          SUM(sum_amount) AS last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' AND bu_code = $1 and department_code=$2
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
    `, [bu, dpt]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  } finally {
    client.release();
  }
});



router.get('/area', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;
  console.log('bu:', bu);
  console.log('dpt:', dpt);
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
        WHERE yeardoc IN ('2024', '2025') AND monthdoc = TO_CHAR(current_date, 'MM')::int  and bu_code=$1 and department_code=$2
        UNION 
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_target
        WHERE year_part = '2025' AND month_part = TO_CHAR(current_date, 'MM')  and bu=$1 and department_code=$2
      ) area
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
        FROM odg_target
        WHERE year_part = '2025' AND month_part = TO_CHAR(current_date, 'MM') and bu=$1 and department_code=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int and bu_code=$1 and department_code=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int and bu_code=$1 and department_code=$2
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
        WHERE yeardoc IN ('2024', '2025') AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1  and bu_code=$1 and department_code=$2
        UNION
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_target
        WHERE year_part = '2025' AND month_part::int = TO_CHAR(current_date, 'MM')::int - 1  and bu=$1 and department_code=$2
      ) area
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
        FROM odg_target
        WHERE year_part = '2025' AND month_part::int = TO_CHAR(current_date, 'MM')::int - 1  and bu=$1 and department_code=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1  and bu_code=$1 and department_code=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1  and bu_code=$1 and department_code=$2
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
        WHERE year_part = '2025' and bu=$1 and department_code=$2
      ) area
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
        FROM odg_target
        WHERE year_part = '2025' and bu=$1 and department_code=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = '2025' and bu_code=$1 and department_code=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail
        WHERE yeardoc = '2024' and bu_code=$1 and department_code=$2
        GROUP BY COALESCE(NULLIF(TRIM(area_code), ''), '00')
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code;
    `;

    const [thisMonth, lastMonth, fullyear] = await Promise.all([
      pool.query(queryThisMonth, [bu, dpt]),
      pool.query(queryLastMonth, [bu, dpt]),
      pool.query(queryFullYear, [bu, dpt])
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

router.get('/area-top-customers', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;
  console.log('bu:', bu);
  console.log('dpt:', dpt);

  try {
    const query = `
    WITH 
      current_month AS (SELECT TO_CHAR(current_date, 'MM')::int AS cm),
      last_month AS (SELECT (TO_CHAR(current_date, 'MM')::int - 1) AS lm),

      -- 📌 รวมยอด Fullyear
      full_year_top AS (
        SELECT area_code, customername, SUM(sum_amount) AS total_amount
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND bu_code = $1 and department_code=$2
        GROUP BY area_code, customername
      ),

      -- 📌 รวมยอด Last Month
      last_month_top AS (
        SELECT s.area_code, s.customername, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, last_month lm
        WHERE s.yeardoc = '2025' AND s.monthdoc = lm.lm AND s.bu_code = $1 and department_code=$2
        GROUP BY s.area_code, s.customername
      ),

      -- 📌 รวมยอด This Month
      this_month_top AS (
        SELECT s.area_code, s.customername, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, current_month cm
        WHERE s.yeardoc = '2025' AND s.monthdoc = cm.cm AND s.bu_code = $1 and department_code=$2
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

    const result = await pool.query(query, [bu, dpt]); // ✅ inject buCode here
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error loading top customers by area:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



router.get('/area-top-product', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;

  try {
    const query = `
    WITH 
      current_month AS (SELECT TO_CHAR(current_date, 'MM')::int AS cm),
      last_month AS (SELECT (TO_CHAR(current_date, 'MM')::int - 1) AS lm),

      -- 📌 Fullyear
      full_year_top AS (
        SELECT area_code, item_name, SUM(sum_amount) AS total_amount
        FROM odg_sale_detail
        WHERE yeardoc = '2025' AND bu_code = $1 and department_code=$2
        GROUP BY area_code, item_name 
      ),

      -- 📌 Last Month
      last_month_top AS (
        SELECT s.area_code, s.item_name, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, last_month lm
        WHERE s.yeardoc = '2025' AND s.monthdoc = lm.lm AND s.bu_code = $1  and department_code=$2
        GROUP BY s.area_code, s.item_name
      ),

      -- 📌 This Month
      this_month_top AS (
        SELECT s.area_code, s.item_name, SUM(s.sum_amount) AS total_amount
        FROM odg_sale_detail s, current_month cm
        WHERE s.yeardoc = '2025' AND s.monthdoc = cm.cm AND s.bu_code = $1  and department_code=$2
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

    const result = await pool.query(query, [bu, dpt]); // ✅ buCode passed safely
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error loading top products by area:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




router.get('/province', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;

  try {
    const thisMonthQuery = `
      SELECT province_name,
        SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
        SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
      FROM odg_sale_detail
      WHERE yeardoc IN ('2025', '2024') 
        AND bu_code = $1 and department_code=$2
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
        AND bu_code = $1 and department_code=$2
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
        AND bu_code = $1 and department_code=$2
      GROUP BY province_name
      ORDER BY this_year DESC;
    `;

    const [thisMonth, lastMonth, fullyear] = await Promise.all([
      pool.query(thisMonthQuery, [bu, dpt]),
      pool.query(lastMonthQuery, [bu, dpt]),
      pool.query(fullYearQuery, [bu, dpt])
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

router.get('/salemap', async (req, res) => {
  const bu = req.query.bu;
  const dpt = req.query.department;

  try {
    const query = `
                WITH total_sales AS (
                  SELECT province, SUM(sum_amount) AS total
                  FROM odg_sale_detail
                  WHERE yeardoc = '2025' AND bu_code = $1 and department_code=$2
                  GROUP BY province
                ),

                top_customers AS (
                  SELECT province, json_agg(t) AS top10customer
                  FROM (
                    SELECT province, customername, SUM(sum_amount) AS total_amount,
                          RANK() OVER (PARTITION BY province ORDER BY SUM(sum_amount) DESC) AS rnk
                    FROM odg_sale_detail
                    WHERE bu_code = $1 and department_code=$2
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
                    WHERE bu_code = $1 and department_code=$2
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

    const result = await pool.query(query, [bu, dpt]);
    res.json(result.rows);

  } catch (err) {
    console.error('❌ Error fetching sale map:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
