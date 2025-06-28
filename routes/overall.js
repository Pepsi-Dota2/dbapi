const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/saletotal', async (req, res) => {
  try {
    const client = await pool.connect();
    const bu = req.query.bu || 'all';
    const isFilterBU = bu.toLowerCase() !== 'all';

    const query = `
      WITH current_date_parts AS (
        SELECT 
          EXTRACT(YEAR FROM CURRENT_DATE)::int AS this_year,
          EXTRACT(MONTH FROM CURRENT_DATE)::int AS this_month,
          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN 12 ELSE EXTRACT(MONTH FROM CURRENT_DATE)::int - 1 END AS last_month,
          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int END AS last_month_year,
          CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - 2 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1 END AS last_year
      ),
      -- Pre-aggregate sales data once
      sales_agg AS (
        SELECT 
          bu_code,
          bu_name,
          -- Year totals
          SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS revenue_2025_total,
          SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS revenue_2024_total,
          -- YTD totals (up to current month)
          SUM(CASE WHEN yeardoc = '2025' AND EXTRACT(MONTH FROM doc_date) <= (SELECT this_month FROM current_date_parts) THEN sum_amount ELSE 0 END) AS revenue_2025_ytd,
          SUM(CASE WHEN yeardoc = '2024' AND EXTRACT(MONTH FROM doc_date) <= (SELECT this_month FROM current_date_parts) THEN sum_amount ELSE 0 END) AS revenue_2024_ytd,
          -- Current month
          SUM(CASE WHEN yeardoc = '2025' AND monthdoc = (SELECT this_month FROM current_date_parts) THEN sum_amount ELSE 0 END) AS revenue_2025_current_month,
          SUM(CASE WHEN yeardoc = '2024' AND monthdoc = (SELECT this_month FROM current_date_parts) THEN sum_amount ELSE 0 END) AS revenue_2024_current_month,
          -- Last month
          SUM(CASE WHEN yeardoc = (SELECT last_month_year FROM current_date_parts) AND monthdoc = (SELECT last_month FROM current_date_parts) THEN sum_amount ELSE 0 END) AS revenue_last_month,
          SUM(CASE WHEN yeardoc = (SELECT last_year FROM current_date_parts) AND monthdoc = (SELECT last_month FROM current_date_parts) THEN sum_amount ELSE 0 END) AS revenue_last_month_ly
        FROM odg_sale_detail
        ${isFilterBU ? 'WHERE bu_code = $1' : ''}
        GROUP BY bu_code,bu_name
      ),
      -- Pre-aggregate target data once
      target_agg AS (
        SELECT 
          bu,name_1 AS bu_name,
          -- Year target
          SUM(CASE WHEN year_part = '2025' THEN targat_amount ELSE 0 END) AS target_2025_total,
          -- YTD target
          SUM(CASE WHEN year_part = '2025' AND month_part::int <= (SELECT this_month FROM current_date_parts) THEN targat_amount ELSE 0 END) AS target_2025_ytd,
          -- Current month target
          SUM(CASE WHEN year_part = '2025' AND month_part::int = (SELECT this_month FROM current_date_parts) THEN targat_amount ELSE 0 END) AS target_2025_current_month,
          -- Last month target
          SUM(CASE WHEN year_part::int = (SELECT last_month_year FROM current_date_parts) AND month_part::int = (SELECT last_month FROM current_date_parts) THEN targat_amount ELSE 0 END) AS target_last_month
        FROM odg_target a
        left join odg_bu b on a.bu = b.code

        ${isFilterBU ? 'WHERE bu = $1' : ''}
        GROUP BY bu,name_1
      ),
      -- Combine and calculate totals
      combined_totals AS (
        SELECT
          -- Total year
          SUM(COALESCE(ta.target_2025_total, 0)) AS total_year_target,
          SUM(COALESCE(sa.revenue_2025_total, 0)) AS total_year_revenue,
          SUM(COALESCE(sa.revenue_2024_total, 0)) AS total_year_last_year,
          -- Total YTD
          SUM(COALESCE(ta.target_2025_ytd, 0)) AS total_avg_target,
          SUM(COALESCE(sa.revenue_2025_ytd, 0)) AS total_avg_revenue,
          SUM(COALESCE(sa.revenue_2024_ytd, 0)) AS total_avg_last_year,
          -- Total current month
          SUM(COALESCE(ta.target_2025_current_month, 0)) AS total_month_target,
          SUM(COALESCE(sa.revenue_2025_current_month, 0)) AS total_month_revenue,
          SUM(COALESCE(sa.revenue_2024_current_month, 0)) AS total_month_last_year,
          -- Last month
          SUM(COALESCE(ta.target_last_month, 0)) AS last_month_target,
          SUM(COALESCE(sa.revenue_last_month, 0)) AS last_month_achivement,
          SUM(COALESCE(sa.revenue_last_month_ly, 0)) AS last_month_last_year
        FROM target_agg ta
        FULL OUTER JOIN sales_agg sa ON ta.bu = sa.bu_code
      ),
      -- BU summary
bu_summary AS (
  SELECT json_agg(
    json_build_object(
      'bu_name', ta.bu_name,  -- 🔧 เปลี่ยนตรงนี้
      'total_year_target', COALESCE(ta.target_2025_total, 0),
      'total_year_revenue', COALESCE(sa.revenue_2025_total, 0),
      'total_year_last_year', COALESCE(sa.revenue_2024_total, 0),
      'total_avg_target', COALESCE(ta.target_2025_ytd, 0),
      'total_avg_revenue', COALESCE(sa.revenue_2025_ytd, 0),
      'total_avg_last_year', COALESCE(sa.revenue_2024_ytd, 0),
      'total_month_target', COALESCE(ta.target_2025_current_month, 0),
      'total_month_revenue', COALESCE(sa.revenue_2025_current_month, 0),
      'total_month_last_year', COALESCE(sa.revenue_2024_current_month, 0)
    )
  ) AS bu_summary
  FROM target_agg ta
  FULL OUTER JOIN sales_agg sa ON ta.bu = sa.bu_code
)

      
      SELECT 
        ct.*,
        bs.bu_summary
      FROM combined_totals ct
      CROSS JOIN bu_summary bs;
    `;

    const params = isFilterBU ? [bu] : [];
    const result = await client.query(query, params);
    client.release();

    const row = result.rows[0];
    res.json({
      total_year: {
        target: row.total_year_target,
        revenue: row.total_year_revenue,
        last_year: row.total_year_last_year
      },
      total_avg: {
        target: row.total_avg_target,
        revenue: row.total_avg_revenue,
        last_year: row.total_avg_last_year
      },
      total_month: {
        target: row.total_month_target,
        revenue: row.total_month_revenue,
        last_year: row.total_month_last_year
      },
      lastMonth: {
        target: row.last_month_target,
        revenue: row.last_month_achivement,
        last_year: row.last_month_last_year
      },
      bu_summary: row.bu_summary
    });

  } catch (err) {
    console.error('Error fetching saletotal:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/quarterly', async (req, res) => {
  const bu = req.query.bu || 'all';
  const area = req.query.area || 'all';
  const isFilterBU = bu.toLowerCase() !== 'all';
  const isFilterArea = area.toLowerCase() !== 'all';

  try {
    let params = [];
    let targetWhere = "year_part = '2025'";
    let revenueWhere = "yeardoc = '2025'";
    let lastYearWhere = "yeardoc = '2024'";

    if (isFilterBU) {
      params.push(bu);
      targetWhere += ` AND bu = $${params.length}`;
      revenueWhere += ` AND bu_code = $${params.length}`;
      lastYearWhere += ` AND bu_code = $${params.length}`;
    }
    if (isFilterArea) {
      params.push(area);
      targetWhere += ` AND area_code = $${params.length}`;
      revenueWhere += ` AND area_code = $${params.length}`;
      lastYearWhere += ` AND area_code = $${params.length}`;
    }

    const query = `
      SELECT 'Q' || quarter_num AS quarter,
             COALESCE(SUM(target), 0) AS target,
             COALESCE(SUM(revenue), 0) AS revenue,
             COALESCE(SUM(last_year), 0) AS last_year
      FROM (
        SELECT CEIL(month_part::int / 3.0) AS quarter_num, SUM(targat_amount) AS target, 0 AS revenue, 0 AS last_year
        FROM odg_target
        WHERE ${targetWhere}
        GROUP BY CEIL(month_part::int / 3.0)

        UNION ALL

        SELECT EXTRACT(QUARTER FROM doc_date) AS quarter_num, 0 AS target, SUM(sum_amount) AS revenue, 0 AS last_year
        FROM odg_sale_detail
        WHERE ${revenueWhere}
        GROUP BY EXTRACT(QUARTER FROM doc_date)

        UNION ALL

        SELECT EXTRACT(QUARTER FROM doc_date) AS quarter_num, 0 AS target, 0 AS revenue, SUM(sum_amount) AS last_year
        FROM odg_sale_detail
        WHERE ${lastYearWhere}
        GROUP BY EXTRACT(QUARTER FROM doc_date)
      ) AS combined
      GROUP BY quarter_num
      ORDER BY quarter_num;
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching quarterly sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/monthly', async (req, res) => {
  try {
    const { bu = 'all', area_code = 'all', department_code = 'all' } = req.query;
    const params = [];

    const channelMap = (channelName) => {
      switch (channelName) {
        case 'ຂາຍໜ້າຮ້ານ': return '%1';
        case 'ຂາຍສົ່ງ': return '%2';
        case 'ຂາຍໂຄງການ': return '%3';
        case 'ຂາຍຊ່າງ': return '%4';
        default: return null;
      }
    };

    const buildCondition = (value, column) => {
      if (!value || value.toLowerCase() === 'all') return '';
      params.push(value);
      return `AND ${column} = $${params.length}`;
    };

    const buCond = buildCondition(bu, 'bu_code');
    const areaCond = buildCondition(area_code, 'area_code');
    const departmentCond = buildCondition(department_code, 'department_code');

    const targetConditions = `
      WHERE year_part = '2025'
      ${buCond}
      ${areaCond}
      ${departmentCond}
    `;

    const query = `
      WITH months AS (
        SELECT generate_series(1, 12) AS month
      ),
      target_by_month AS (
        SELECT 
          month_part::int AS month,
          CASE 
            WHEN department_code LIKE '%1' THEN 'ຂາຍໜ້າຮ້ານ'
            WHEN department_code LIKE '%2' THEN 'ຂາຍສົ່ງ'
            WHEN department_code LIKE '%3' THEN 'ຂາຍໂຄງການ'
            WHEN department_code LIKE '%4' THEN 'ຂາຍຊ່າງ'
            ELSE 'ບໍ່ຮູ້ຈັກ'
          END AS channel_name,
          SUM(targat_amount) AS target
        FROM odg_target  WHERE year_part = '2025'   AND ($1::text IS NULL OR bu = $1)AND ($1::text IS NULL OR area_code = $1)
        GROUP BY 
          month_part,
          CASE 
            WHEN department_code LIKE '%1' THEN 'ຂາຍໜ້າຮ້ານ'
            WHEN department_code LIKE '%2' THEN 'ຂາຍສົ່ງ'
            WHEN department_code LIKE '%3' THEN 'ຂາຍໂຄງການ'
            WHEN department_code LIKE '%4' THEN 'ຂາຍຊ່າງ'
            ELSE 'ບໍ່ຮູ້ຈັກ'
          END
      ),
      current_year_revenue AS (
        SELECT 
          monthdoc AS month,
          CASE 
            WHEN department_code LIKE '%1' THEN 'ຂາຍໜ້າຮ້ານ'
            WHEN department_code LIKE '%2' THEN 'ຂາຍສົ່ງ'
            WHEN department_code LIKE '%3' THEN 'ຂາຍໂຄງການ'
            WHEN department_code LIKE '%4' THEN 'ຂາຍຊ່າງ'
            ELSE 'ບໍ່ຮູ້ຈັກ'
          END AS channel_name,
          SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = 2025
        ${buCond}
        ${areaCond}
        ${departmentCond}
        GROUP BY 
          monthdoc,
          CASE 
            WHEN department_code LIKE '%1' THEN 'ຂາຍໜ້າຮ້ານ'
            WHEN department_code LIKE '%2' THEN 'ຂາຍສົ່ງ'
            WHEN department_code LIKE '%3' THEN 'ຂາຍໂຄງການ'
            WHEN department_code LIKE '%4' THEN 'ຂາຍຊ່າງ'
            ELSE 'ບໍ່ຮູ້ຈັກ'
          END
      ),
      last_year_revenue AS (
        SELECT 
          monthdoc AS month,
          CASE 
            WHEN department_code LIKE '%1' THEN 'ຂາຍໜ້າຮ້ານ'
            WHEN department_code LIKE '%2' THEN 'ຂາຍສົ່ງ'
            WHEN department_code LIKE '%3' THEN 'ຂາຍໂຄງການ'
            WHEN department_code LIKE '%4' THEN 'ຂາຍຊ່າງ'
            ELSE 'ບໍ່ຮູ້ຈັກ'
          END AS channel_name,
          SUM(sum_amount) AS revenue
        FROM odg_sale_detail
        WHERE yeardoc = 2024
        ${buCond}
        ${areaCond}
        ${departmentCond}
        GROUP BY 
          monthdoc,
          CASE 
            WHEN department_code LIKE '%1' THEN 'ຂາຍໜ້າຮ້ານ'
            WHEN department_code LIKE '%2' THEN 'ຂາຍສົ່ງ'
            WHEN department_code LIKE '%3' THEN 'ຂາຍໂຄງການ'
            WHEN department_code LIKE '%4' THEN 'ຂາຍຊ່າງ'
            ELSE 'ບໍ່ຮູ້ຈັກ'
          END
      )
      SELECT 
        m.month,
        COALESCE(t.target, 0) AS target,
        COALESCE(c.revenue, 0) AS revenue,
        COALESCE(l.revenue, 0) AS last_year
      FROM months m
      LEFT JOIN target_by_month t ON m.month = t.month
      LEFT JOIN current_year_revenue c ON m.month = c.month AND t.channel_name = c.channel_name
      LEFT JOIN last_year_revenue l ON m.month = l.month AND COALESCE(t.channel_name, c.channel_name) = l.channel_name
      ORDER BY m.month;
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching monthly sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});




router.get('/accumulated', async (req, res) => {
  const client = await pool.connect();
  try {
    const bu = req.query.bu || 'all';
    const isFilterBU = bu.toLowerCase() !== 'all';

    // query
    const query = `
            WITH target_by_month AS (
                SELECT 
                    month_part::int AS month,
                    SUM(targat_amount) AS target
                FROM odg_target
                WHERE year_part = '2025'
                ${isFilterBU ? `AND bu = $1` : ''}
                GROUP BY month_part
            ),
            current_year_revenue AS (
                SELECT 
                    monthdoc AS month,
                    SUM(sum_amount) AS revenue
                FROM odg_sale_detail
                WHERE yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)::int
                ${isFilterBU ? `AND bu_code = $1` : ''}
                GROUP BY monthdoc
            ),
            last_year_revenue AS (
                SELECT 
                    monthdoc AS month,
                    SUM(sum_amount) AS last_year
                FROM odg_sale_detail
                WHERE yeardoc = (EXTRACT(YEAR FROM CURRENT_DATE)::int - 1)
                ${isFilterBU ? `AND bu_code = $1` : ''}
                GROUP BY monthdoc
            ),
            combined_data AS (
                SELECT m.month,
                    COALESCE(t.target, 0) AS target,
                    COALESCE(c.revenue, 0) AS revenue,
                    COALESCE(l.last_year, 0) AS last_year
                FROM (
                    SELECT generate_series(1,12) AS month
                ) m
                LEFT JOIN target_by_month t ON m.month = t.month
                LEFT JOIN current_year_revenue c ON m.month = c.month
                LEFT JOIN last_year_revenue l ON m.month = l.month
            )
            SELECT 
                month,
                SUM(target) OVER (ORDER BY month) AS accumulated_target,
                SUM(revenue) OVER (ORDER BY month) AS accumulated_revenue,
                SUM(last_year) OVER (ORDER BY month) AS accumulated_last_year
            FROM combined_data
            ORDER BY month;
        `;

    const params = isFilterBU ? [bu] : [];
    const result = await client.query(query, params);
    console.log('Accumulated data:', result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching accumulated monthly data:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});


router.get('/bu-summary', async (req, res) => {
  const { bu, filter } = req.query;

  // 🔥 Filter SQL เงื่อนไขช่วงเวลา
  let filterCondition = '';
  if (filter === 'this_month') {
    filterCondition = `AND monthdoc = EXTRACT(MONTH FROM CURRENT_DATE) AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)`;
  } else if (filter === 'last_month') {
    filterCondition = `AND monthdoc = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month') AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')`;
  } else if (filter === 'accumulated') {
    filterCondition = `AND monthdoc BETWEEN 1 AND EXTRACT(MONTH FROM CURRENT_DATE) AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)`;
  } else if (filter === 'full_year') {
    filterCondition = `AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)`; // 🔥 ทั้งปี
  }

  try {
    const query = `
      SELECT 
          COALESCE(s.bu_name, t.bu) AS bu_name,
          COALESCE(SUM(t.target_amount), 0) AS target_total,
          COALESCE(SUM(s.total), 0) AS total
      FROM 
          (SELECT bu, SUM(targat_amount) AS target_amount
           FROM odg_target
           GROUP BY bu) t
      FULL OUTER JOIN
          (SELECT bu_code, bu_name,
                  SUM(sum_amount) AS total
           FROM odg_sale_detail
           WHERE 1=1
             ${filterCondition}
           GROUP BY bu_code, bu_name) s
      ON t.bu = s.bu_code
      WHERE ($1::text IS NULL OR COALESCE(s.bu_name, t.bu) = $1)
      GROUP BY COALESCE(s.bu_name, t.bu)
      ORDER BY total DESC
      LIMIT 10;
    `;

    const result = await pool.query(query, [bu || null]);

    res.json({ list: result.rows });
  } catch (err) {
    console.error('❌ Database query failed:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




router.get('/top-customers', async (req, res) => {
  const filter = req.query.filter || 'month';
  const area = req.query.area;  // รับค่า area
  const bu = req.query.bu;      // รับค่า bu
  let query = '';
  let params = [];
  console.log('Filter:', filter, 'Area:', area, 'BU:', bu);

  // เงื่อนไข area
  let areaCondition = '';
  if (area && area.trim().toLowerCase() !== 'all') {
    areaCondition = `AND area_code = $${params.length + 1}`;
    params.push(area);
  }

  // เงื่อนไข bu
  let buCondition = '';
  if (bu && bu.trim().toLowerCase() !== 'all') {
    buCondition = `AND bu_code = $${params.length + 1}`;
    params.push(bu);
  }

  // รวมเงื่อนไขทั้งหมด
  const extraConditions = `${areaCondition} ${buCondition}`;

  if (filter === 'month') {
    query = `
      SELECT 
        customername AS cust_name,
        COALESCE(SUM(CASE WHEN yeardoc = '2025' THEN sum_amount END), 0) AS total_2025,
        COALESCE(SUM(CASE WHEN yeardoc = '2024' THEN sum_amount END), 0) AS total_2024
      FROM odg_sale_detail
      WHERE 
        ar_code = '102'
        AND to_char(doc_date, 'MM') = to_char(CURRENT_DATE, 'MM')
        AND yeardoc IN ('2025', '2024')
        ${extraConditions}
      GROUP BY customername
      ORDER BY total_2025 DESC
      LIMIT 10;
    `;
  } else if (filter === 'lastMonth') {
    query = `
      SELECT 
        customername AS cust_name,
        COALESCE(SUM(CASE WHEN yeardoc = '2025' THEN sum_amount END), 0) AS total_2025,
        COALESCE(SUM(CASE WHEN yeardoc = '2024' THEN sum_amount END), 0) AS total_2024
      FROM odg_sale_detail
      WHERE 
        ar_code = '102'
        AND to_char(doc_date, 'MM') = to_char(date_trunc('month', CURRENT_DATE - interval '1 month'), 'MM')
        AND yeardoc IN ('2025', '2024')
        ${extraConditions}
      GROUP BY customername
      ORDER BY total_2025 DESC
      LIMIT 10;
    `;
  } else if (filter === 'year') {
    query = `
      SELECT 
        customername AS cust_name,
        COALESCE(SUM(CASE WHEN yeardoc = '2025' THEN sum_amount END), 0) AS total_2025,
        COALESCE(SUM(CASE WHEN yeardoc = '2024' THEN sum_amount END), 0) AS total_2024
      FROM odg_sale_detail
      WHERE 
        ar_code = '102'
        AND yeardoc IN ('2025', '2024')
        ${extraConditions}
      GROUP BY customername
      ORDER BY total_2025 DESC
      LIMIT 10;
    `;
  } else if (filter === 'accumulated') {
    query = `
      SELECT 
        customername AS cust_name,
        COALESCE(SUM(CASE WHEN yeardoc = '2025' AND monthdoc BETWEEN 1 AND to_char(current_date,'MM')::int THEN sum_amount END), 0) AS total_2025,
        COALESCE(SUM(CASE WHEN yeardoc = '2024' AND monthdoc BETWEEN 1 AND to_char(current_date,'MM')::int THEN sum_amount END), 0) AS total_2024
      FROM odg_sale_detail
      WHERE 
        ar_code = '102'
        AND yeardoc IN ('2025', '2024')
        ${extraConditions}
      GROUP BY customername
      ORDER BY total_2025 DESC
      LIMIT 10;
    `;
  }

  try {
    const result = await pool.query(query, params);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('❌ Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/channel-summary', async (req, res) => {
  const filter = req.query.filter || 'thisMonth';
  let query = '';

  try {
    if (filter === 'thisMonth') {
      query = `
        SELECT channel_name,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE) 
              AND doc_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') 
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 year') 
              AND doc_date < (date_trunc('month', CURRENT_DATE - INTERVAL '1 year') + INTERVAL '1 month') 
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        GROUP BY channel_name
        ORDER BY total_2025 DESC;
      `;
    } else if (filter === 'lastMonth') {
      query = `
        SELECT channel_name,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') 
              AND doc_date < date_trunc('month', CURRENT_DATE)
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '13 months') 
              AND doc_date < date_trunc('month', CURRENT_DATE - INTERVAL '12 months')
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        GROUP BY channel_name
        ORDER BY total_2025 DESC;
      `;
    } else if (filter === 'accumulated') {
      query = `
        SELECT channel_name,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) 
              AND doc_date <= CURRENT_DATE
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1 
              AND doc_date <= (CURRENT_DATE - INTERVAL '1 year')
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        GROUP BY channel_name
        ORDER BY total_2025 DESC;
      `;
    } else if (filter === 'fullYear') {
      query = `
        SELECT channel_name,
          COALESCE(SUM(CASE WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1 THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        GROUP BY channel_name
        ORDER BY total_2025 DESC;
      `;
    }

    const result = await pool.query(query);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching channel summary:', err);
    res.status(500).json({ message: 'Internal server error' });
  }

});
router.get('/top-item-brands', async (req, res) => {
  const filter = req.query.filter || 'thisMonth';
  const bu = req.query.bu || 'all';
  const channel = req.query.channel || 'all';

  let conditions = [];
  let params = [];

  if (bu && bu.toLowerCase() !== 'all') {
    params.push(bu);
    conditions.push(`bu_code = $${params.length}`);
  }
  if (channel && channel.toLowerCase() !== 'all') {
    params.push(channel);
    conditions.push(`channel_name = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = '';
  try {
    if (filter === 'thisMonth') {
      query = `
        SELECT item_brand,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE) 
              AND doc_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 year')
              AND doc_date < date_trunc('month', CURRENT_DATE - INTERVAL '1 year') + INTERVAL '1 month'
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_brand
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'lastMonth') {
      query = `
        SELECT item_brand,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') 
              AND doc_date < date_trunc('month', CURRENT_DATE)
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '13 months')
              AND doc_date < date_trunc('month', CURRENT_DATE - INTERVAL '12 months')
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_brand
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'accumulated') {
      query = `
        SELECT item_brand,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
              AND doc_date <= CURRENT_DATE
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
              AND doc_date <= CURRENT_DATE - INTERVAL '1 year'
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_brand
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'fullYear') {
      query = `
        SELECT item_brand,
          COALESCE(SUM(CASE WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1 THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_brand
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    }

    const result = await pool.query(query, params);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching top item brands:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/top-salespersons', async (req, res) => {
  const filter = req.query.filter || 'thisMonth';
  const bu = req.query.bu || 'all';
  const channel = req.query.channel || 'all';

  let conditions = [];
  let params = [];

  // Filter BU
  if (bu.toLowerCase() !== 'all') {
    params.push(bu);
    conditions.push(`bu_code = $${params.length}`);
  }

  // Filter Channel
  if (channel.toLowerCase() !== 'all') {
    params.push(channel);
    conditions.push(`channel_name = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = '';

  try {
    if (filter === 'thisMonth') {
      query = `
        SELECT salename,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE) 
              AND doc_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 year') 
              AND doc_date < date_trunc('month', CURRENT_DATE - INTERVAL '1 year') + INTERVAL '1 month'
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY salename
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'lastMonth') {
      query = `
        SELECT salename,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') 
              AND doc_date < date_trunc('month', CURRENT_DATE)
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '13 months') 
              AND doc_date < date_trunc('month', CURRENT_DATE - INTERVAL '12 months')
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY salename
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'accumulated') {
      query = `
        SELECT salename,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
              AND doc_date <= CURRENT_DATE
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
              AND doc_date <= CURRENT_DATE - INTERVAL '1 year'
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY salename
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'fullYear') {
      query = `
        SELECT salename,
          COALESCE(SUM(CASE WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1 THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY salename
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    }

    const result = await pool.query(query, params);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching top salespersons:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// router.get('/top-customers', async (req, res) => {
//   const filter = req.query.filter || 'month';
//   let query = '';
//   let params = [];
//   console.log('Filter:', filter);

//   if (filter === 'month') {
//     query = `
//       SELECT 
//         customername AS cust_name,
//         COALESCE(SUM(CASE WHEN yeardoc = '2025' THEN sum_amount END), 0) AS total_2025,
//         COALESCE(SUM(CASE WHEN yeardoc = '2024' THEN sum_amount END), 0) AS total_2024
//       FROM odg_sale_detail
//       WHERE 
//         ar_code = '102'
//         AND to_char(doc_date, 'MM') = to_char(CURRENT_DATE, 'MM')
//         AND yeardoc IN ('2025', '2024')
//       GROUP BY customername
//       ORDER BY total_2025 DESC
//       LIMIT 10;
//     `;
//   } else if (filter === 'lastMonth') {
//     query = `
//       SELECT 
//         customername AS cust_name,
//         COALESCE(SUM(CASE WHEN yeardoc = '2025' THEN sum_amount END), 0) AS total_2025,
//         COALESCE(SUM(CASE WHEN yeardoc = '2024' THEN sum_amount END), 0) AS total_2024
//       FROM odg_sale_detail
//       WHERE 
//         ar_code = '102'
//         AND to_char(doc_date, 'MM') = to_char(date_trunc('month', CURRENT_DATE - interval '1 month'), 'MM')
//         AND yeardoc IN ('2025', '2024')
//       GROUP BY customername
//       ORDER BY total_2025 DESC
//       LIMIT 10;
//     `;
//   } else if (filter === 'year') {
//     query = `
//       SELECT 
//         customername AS cust_name,
//         COALESCE(SUM(CASE WHEN yeardoc = '2025' THEN sum_amount END), 0) AS total_2025,
//         COALESCE(SUM(CASE WHEN yeardoc = '2024' THEN sum_amount END), 0) AS total_2024
//       FROM odg_sale_detail
//       WHERE 
//         ar_code = '102'
//         AND yeardoc IN ('2025', '2024')
//       GROUP BY customername
//       ORDER BY total_2025 DESC
//       LIMIT 10;
//     `;
//   } else if (filter === 'accumulated') {
//     query = `
//       SELECT 
//         customername AS cust_name,
//         COALESCE(SUM(CASE WHEN yeardoc = '2025' AND monthdoc between 1 and to_char(current_date,'MM')::int THEN sum_amount END), 0) AS total_2025,
//         COALESCE(SUM(CASE WHEN yeardoc = '2024' AND monthdoc between 1 and to_char(current_date,'MM')::int THEN sum_amount END), 0) AS total_2024
//       FROM odg_sale_detail
//       WHERE ar_code = '102'AND yeardoc IN ('2025', '2024')
//       GROUP BY customername
//       ORDER BY total_2025 DESC
//       LIMIT 10;
//     `;
//   }

//   try {
//     const result = await pool.query(query);
//     res.json({ list: result.rows });
//   } catch (err) {
//     console.error('❌ Database error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });
// router.get('/top-products', async (req, res) => {
router.get('/top-products', async (req, res) => {
  const filter = req.query.filter || 'month';
  const zone = req.query.zone || 'all';
  const bu = req.query.bu || 'all';
  console.log('Filter:', filter, 'Zone:', zone, 'BU:', bu);
  let conditions = [];
  let params = [];

  // Filter BU
  if (bu && bu.toLowerCase() !== 'all') {
    params.push(bu);
    conditions.push(`bu_code = $${params.length}`);
  }

  // Filter ZONE (area_code)
  if (zone && zone.toLowerCase() !== 'all') {
    params.push(zone);
    conditions.push(`area_code = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = '';
  try {
    if (filter === 'month') {
      query = `
        SELECT item_code, item_name,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE)
              AND doc_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 year')
              AND doc_date < (date_trunc('month', CURRENT_DATE - INTERVAL '1 year') + INTERVAL '1 month')
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_code, item_name
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'lastMonth') {
      query = `
        SELECT item_code, item_name,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
              AND doc_date < date_trunc('month', CURRENT_DATE)
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN doc_date >= date_trunc('month', CURRENT_DATE - INTERVAL '13 months')
              AND doc_date < date_trunc('month', CURRENT_DATE - INTERVAL '12 months')
              AND yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_code, item_name
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'year') {
      query = `
        SELECT item_code, item_name,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_code, item_name
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    } else if (filter === 'accumulated') {
      query = `
        SELECT item_code, item_name,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE)
              AND doc_date <= CURRENT_DATE
            THEN sum_amount ELSE 0 END), 0) AS total_2025,
          COALESCE(SUM(CASE 
            WHEN yeardoc = EXTRACT(YEAR FROM CURRENT_DATE) - 1
              AND doc_date <= (CURRENT_DATE - INTERVAL '1 year')
            THEN sum_amount ELSE 0 END), 0) AS total_2024
        FROM odg_sale_detail
        ${whereClause}
        GROUP BY item_code, item_name
        ORDER BY total_2025 DESC
        LIMIT 10;
      `;
    }

    const result = await pool.query(query, params);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching top products:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});





router.get('/top10-customers-by-area', async (req, res) => {
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
router.get('/top10-product-by-area', async (req, res) => {
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
router.get('/area', async (req, res) => {
  const filter = req.query.filter || 'month';
  let query = '';

  if (filter === 'month') {
    query = `
      SELECT area.area_code, ar_sale_area.name_1 AS area_name,
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
      LEFT JOIN ar_sale_area ON area.area_code = ar_sale_area.code
      LEFT JOIN (
        SELECT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code, SUM(targat_amount) AS target_amount
        FROM odg_target WHERE year_part = '2025' AND month_part = TO_CHAR(current_date, 'MM')
        GROUP BY area_code
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int
        GROUP BY area_code
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int
        GROUP BY area_code
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code
    `;
  } else if (filter === 'lastMonth') {
    query = `
      SELECT area.area_code, ar_sale_area.name_1 AS area_name,
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
      LEFT JOIN ar_sale_area ON area.area_code = ar_sale_area.code
      LEFT JOIN (
        SELECT area_code, SUM(targat_amount) AS target_amount
        FROM odg_target WHERE year_part = '2025' AND month_part::int = TO_CHAR(current_date, 'MM')::int - 1
        GROUP BY area_code
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail WHERE yeardoc = '2025' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1
        GROUP BY area_code
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail WHERE yeardoc = '2024' AND monthdoc = TO_CHAR(current_date, 'MM')::int - 1
        GROUP BY area_code
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code
    `;
  } else if (filter === 'year') {
    query = `
      SELECT area.area_code, ar_sale_area.name_1 AS area_name,
        COALESCE(target.target_amount, 0) AS target_amount,
        COALESCE(rev2025.revenue, 0) AS revenue,
        COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_sale_detail WHERE yeardoc IN ('2024', '2025')
        UNION
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_target WHERE year_part = '2025'
      ) area
      LEFT JOIN ar_sale_area ON area.area_code = ar_sale_area.code
      LEFT JOIN (
        SELECT area_code, SUM(targat_amount) AS target_amount
        FROM odg_target WHERE year_part = '2025'
        GROUP BY area_code
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail WHERE yeardoc = '2025'
        GROUP BY area_code
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail WHERE yeardoc = '2024'
        GROUP BY area_code
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code
    `;
  } else if (filter === 'accumulated') {
    query = `
      SELECT area.area_code, ar_sale_area.name_1 AS area_name,
        COALESCE(target.target_amount, 0) AS target_amount,
        COALESCE(rev2025.revenue, 0) AS revenue,
        COALESCE(rev2024.revenue_last_year, 0) AS revenue_last_year
      FROM (
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_sale_detail WHERE yeardoc IN ('2024', '2025')
        UNION
        SELECT DISTINCT COALESCE(NULLIF(TRIM(area_code), ''), '00') AS area_code
        FROM odg_target WHERE year_part = '2025'
      ) area
      LEFT JOIN ar_sale_area ON area.area_code = ar_sale_area.code
      LEFT JOIN (
        SELECT area_code, SUM(targat_amount) AS target_amount
        FROM odg_target WHERE year_part = '2025' AND month_part::int <= TO_CHAR(current_date, 'MM')::int
        GROUP BY area_code
      ) target ON area.area_code = target.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue
        FROM odg_sale_detail WHERE yeardoc = '2025' AND monthdoc <= TO_CHAR(current_date, 'MM')::int
        GROUP BY area_code
      ) rev2025 ON area.area_code = rev2025.area_code
      LEFT JOIN (
        SELECT area_code, SUM(sum_amount) AS revenue_last_year
        FROM odg_sale_detail WHERE yeardoc = '2024' AND monthdoc <= TO_CHAR(current_date, 'MM')::int
        GROUP BY area_code
      ) rev2024 ON area.area_code = rev2024.area_code
      ORDER BY area.area_code
    `;
  }

  try {
    const result = await pool.query(query);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching sales area data:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/newcustomer', async (req, res) => {
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
router.get('/province', async (req, res) => {
  try {
    const { bu_code } = req.query;  // รับ bu_code จาก query string
    const buCondition = bu_code ? `AND bu_code = '${bu_code}'` : '';

    const thisMonthQuery = `
      SELECT province_name,
        SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
        SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
      FROM odg_sale_detail
      WHERE yeardoc IN ('2025', '2024') 
        AND monthdoc = TO_CHAR(current_date, 'MM')::int
        ${buCondition}
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
        ${buCondition}
      GROUP BY province_name
      ORDER BY this_year DESC;
    `;

    const fullYearQuery = `
      SELECT province_name,
        SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS this_year,
        SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS last_year
      FROM odg_sale_detail
      WHERE yeardoc IN ('2025', '2024')
        ${buCondition}
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
router.get('/salemap', async (req, res) => {
  try {
    const { bu } = req.query; // รับ bu จาก query string
    const buFilter = bu ? `AND bu_code = '${bu}'` : ''; // ถ้า bu ถูกส่งมา ให้ filter

    const query = `
WITH total_sales AS (
  SELECT province, 
         SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS total,
         SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS total_last_year
  FROM odg_sale_detail
  WHERE yeardoc IN ('2025', '2024') ${buFilter}
  GROUP BY province
),

total_sales_all AS (
  SELECT 'odien' AS province, 
         SUM(CASE WHEN yeardoc = '2025' THEN sum_amount ELSE 0 END) AS total,
         SUM(CASE WHEN yeardoc = '2024' THEN sum_amount ELSE 0 END) AS total_last_year
  FROM odg_sale_detail
  WHERE yeardoc IN ('2025', '2024') ${buFilter}
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
    WHERE yeardoc = '2025' ${buFilter}
    GROUP BY province, item_name
  ) t
  WHERE rnk <= 5
),

top_products_all AS (
  SELECT *
  FROM (
    SELECT 
      'odien' AS province, 
      item_name, 
      SUM(sum_amount) AS total_amount,
      RANK() OVER (ORDER BY SUM(sum_amount) DESC) AS rnk
    FROM odg_sale_detail
    WHERE yeardoc = '2025' ${buFilter}
    GROUP BY item_name
  ) t
  WHERE rnk <= 5
),

product_json AS (
  SELECT province, json_agg(json_build_object('item_name', item_name, 'total', total_amount)) AS top5product
  FROM top_products
  GROUP BY province

  UNION ALL

  SELECT province, json_agg(json_build_object('item_name', item_name, 'total', total_amount)) AS top5product
  FROM top_products_all
  GROUP BY province
)

SELECT 
  p.code,
  p.name_1,
  p.lat,
  p.lng,
  COALESCE(s.total, 0) AS total,
  COALESCE(s.total_last_year, 0) AS total_last_year,
  COALESCE(i.top5product, '[]') AS top5product
FROM erp_province p
LEFT JOIN total_sales s ON s.province = p.code
LEFT JOIN product_json i ON i.province = p.code

UNION ALL

SELECT 
  'odien' AS code,
  'odien' AS name_1,
  '17.9610' AS lat,
  '102.6140' AS lng,
  COALESCE(s.total, 0) AS total,
  COALESCE(s.total_last_year, 0) AS total_last_year,
  COALESCE(i.top5product, '[]') AS top5product
FROM total_sales_all s
LEFT JOIN product_json i ON i.province = 'odien'

ORDER BY code;
    `;

    const result = await pool.query(query);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching sale map:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// 🚀 API endpoint to fetch BU data
router.get('/bu-list', async (req, res) => {
  try {
    const result = await pool.query("SELECT code, name_1 FROM odg_bu where code not in ('15','17') order by code asc");
    res.json(result.rows);
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});
router.get('/sale-summary/weeks-in-month', async (req, res) => {
  const { year = 2025 } = req.query;

  const query = `
    SELECT 
      CASE 
        WHEN EXTRACT(DAY FROM doc_date) BETWEEN 1 AND 7 THEN 'Week 1'
        WHEN EXTRACT(DAY FROM doc_date) BETWEEN 8 AND 14 THEN 'Week 2'
        WHEN EXTRACT(DAY FROM doc_date) BETWEEN 15 AND 21 THEN 'Week 3'
        WHEN EXTRACT(DAY FROM doc_date) BETWEEN 22 AND 28 THEN 'Week 4'
        ELSE 'Week 5'
      END AS week_in_month,
      SUM(sum_amount) AS total_amount
    FROM odg_sale_detail
    WHERE yeardoc = $1
    GROUP BY  week_in_month
    ORDER BY  week_in_month;
  `;

  try {
    const result = await pool.query(query, [year]);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching week sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});



router.get('/sale-summary/month', async (req, res) => {
  const { year = 2025 } = req.query;

  const query = `
WITH months AS (
    SELECT generate_series(1, 12) AS monthdoc
)
SELECT 
    m.monthdoc AS month,
    COALESCE(SUM(d.sum_amount), 0) AS total_amount
FROM months m
LEFT JOIN odg_sale_detail d
    ON d.monthdoc = m.monthdoc AND d.yeardoc = $1
GROUP BY m.monthdoc
ORDER BY m.monthdoc;

  `;

  try {
    const result = await pool.query(query, [year]);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching month summary:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/sale-summary/day', async (req, res) => {
  const { year = 2025 } = req.query;

  const query = `
    SELECT 
      EXTRACT(DAY FROM doc_date) AS day,
      SUM(sum_amount) AS total_amount
    FROM odg_sale_detail
    WHERE yeardoc = $1 
    GROUP BY day
    ORDER BY day;
  `;

  try {
    const result = await pool.query(query, [year, month]);
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching day summary:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/sale-summary/hour-all', async (req, res) => {
  const { year = 2025 } = req.query;

  const query = `
    SELECT 
      hours.hour AS hour,
      COALESCE(SUM(odg.sum_amount), 0) AS total_amount
    FROM (
      SELECT generate_series(0, 23) AS hour
    ) AS hours
    LEFT JOIN odg_sale_detail odg
      ON CAST(SUBSTRING(odg.doc_time, 1, 2) AS INTEGER) = hours.hour
      AND odg.yeardoc = $1
    GROUP BY hours.hour
    ORDER BY hours.hour;
  `;

  try {
    const result = await pool.query(query, [year]); // year = '2025'
    res.json({ list: result.rows });
  } catch (err) {
    console.error('Error fetching hour summary:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/sales-by-day', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        CASE EXTRACT(DOW FROM doc_date)
          WHEN 0 THEN 'ອາທິດ'
          WHEN 1 THEN 'ຈັນ'
          WHEN 2 THEN 'ຄານ'
          WHEN 3 THEN 'ພຸດ'
          WHEN 4 THEN 'ພະຫັດ'
          WHEN 5 THEN 'ສຸກ'
          WHEN 6 THEN 'ເສົາ'
        END AS day_name,
        SUM(sum_amount) AS total_amount
      FROM odg_sale_detail
      WHERE yeardoc = 2025
      GROUP BY EXTRACT(DOW FROM doc_date)
      ORDER BY EXTRACT(DOW FROM doc_date)
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching sales data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


module.exports = router;
