const express = require('express');
const router = express.Router();
const pool = require('../db');



router.get('/bcg', async (req, res) => {
  const year = req.query.year ?? '2024';
  const groupMain = req.query.itemmaingroup ?? null;
  const groupSub = req.query.group_sub ?? null;
  const groupSub1 = req.query.group_sub_1 ?? null;
  const category = req.query.item_category ?? null;
  const ph = req.query.ph ?? '00';
  try {
    const { rows } = await pool.query(
      `

      WITH brand_sales AS (
  SELECT
    item_brand,
    SUM(sum_amount) AS revenue,
    SUM(cost_thb_vte * qty) AS cost
  FROM odg_sale_detail
  WHERE yeardoc =  $1
                AND ($2::text IS NULL OR maingroup_code = $2)
                AND ($3::text IS NULL OR itemsubgroup = $3)
                AND ($4::text IS NULL OR itemsubgroup2 = $4)
                AND ($5::text IS NULL OR item_category = $5)
  GROUP BY item_brand
),
total_revenue AS (
  SELECT SUM(revenue) AS total_rev FROM brand_sales
),
brand_metrics AS (
  SELECT
    b.item_brand,
    b.revenue,
    b.cost,
    CASE WHEN b.cost = 0 THEN b.revenue ELSE b.revenue - b.cost END AS gm_amount,
    COALESCE(
      ROUND(
        (CASE WHEN b.cost = 0 THEN 0 ELSE b.revenue - b.cost END)::NUMERIC
        / NULLIF(b.revenue, 0) * 100,
        2
      ),
      0
    ) AS gm_percent,
    ROUND(b.revenue * 100.0 / NULLIF(t.total_rev, 0), 4) AS market_share
  FROM brand_sales b
  CROSS JOIN total_revenue t
),
-- Top brand by market_share (from filtered data)
top_market_brand AS (
  SELECT item_brand AS top_brand
  FROM brand_metrics
  WHERE item_brand IS NOT NULL
  ORDER BY market_share DESC
  LIMIT 1
),
-- Top brand by gm_percent (from filtered data)
top_gm_brand AS (
  SELECT item_brand AS top_brand
  FROM brand_metrics
  WHERE item_brand IS NOT NULL
  ORDER BY gm_percent DESC
  LIMIT 1
),
-- Divider brand from rms table if exists
rms_divider_raw AS (
  SELECT brand AS divider
  FROM odg_rms_divide
  WHERE ph = $5
  LIMIT 1
),
-- Divider brand from rgm table if exists
rgm_divider_raw AS (
  SELECT brand AS divider
  FROM odg_rgm_divide
  WHERE ph = $5
  LIMIT 1
),
-- Final RMS divider (must exist in filtered metrics)
final_rms_brand AS (
  SELECT COALESCE(
    (SELECT divider FROM rms_divider_raw WHERE divider IN (SELECT item_brand FROM brand_metrics)),
    (SELECT top_brand FROM top_market_brand)
  ) AS rms_brand_devider
),
-- Final RGM divider (must exist in filtered metrics)
final_rgm_brand AS (
  SELECT COALESCE(
    (SELECT divider FROM rgm_divider_raw WHERE divider IN (SELECT item_brand FROM brand_metrics)),
    (SELECT top_brand FROM top_gm_brand)
  ) AS rgm_brand_devider
),
-- Base RMS value (market share of divider brand)
rms_base_value AS (
  SELECT m.market_share AS base_rms
  FROM brand_metrics m
  WHERE m.item_brand = (SELECT rms_brand_devider FROM final_rms_brand)
),
-- Base RGM value (gm_percent of divider brand)
rgm_base_value AS (
  SELECT m.gm_percent AS base_rgm
  FROM brand_metrics m
  WHERE m.item_brand = (SELECT rgm_brand_devider FROM final_rgm_brand)
)

SELECT 
  m.item_brand,
  m.revenue,
  m.cost,
  m.gm_amount,
  m.gm_percent,
  m.market_share,
  ROUND(m.market_share / NULLIF(r.base_rms, 0), 4) AS rms,
  ROUND(m.gm_percent / NULLIF(g.base_rgm, 0), 4) AS rgm,
  CASE 
    WHEN ROUND(m.market_share / NULLIF(r.base_rms, 0), 4) >= 0.75 THEN 'ຫຼາຍ'
    ELSE 'ນ້ອຍ'
  END AS rms_maker,
  CASE 
    WHEN ROUND(m.gm_percent / NULLIF(g.base_rgm, 0), 4) >= 0.75 THEN 'ຫຼາຍ'
    ELSE 'ນ້ອຍ'
  END AS rgm_maker,
  CASE 
    WHEN ROUND(m.market_share / NULLIF(r.base_rms, 0), 4) >= 0.75
         AND ROUND(m.gm_percent / NULLIF(g.base_rgm, 0), 4) >= 0.75
      THEN 'star'
    WHEN ROUND(m.market_share / NULLIF(r.base_rms, 0), 4) < 0.75
         AND ROUND(m.gm_percent / NULLIF(g.base_rgm, 0), 4) >= 0.75
      THEN '???'
    WHEN ROUND(m.market_share / NULLIF(r.base_rms, 0), 4) >= 0.75
         AND ROUND(m.gm_percent / NULLIF(g.base_rgm, 0), 4) < 0.75
      THEN 'cash_cow'
    ELSE 'dog'
  END AS bcg,
  CASE WHEN m.item_brand = (SELECT rms_brand_devider FROM final_rms_brand) THEN m.item_brand ELSE '' END AS rms_brand_devider,
  CASE WHEN m.item_brand = (SELECT rgm_brand_devider FROM final_rgm_brand) THEN m.item_brand ELSE '' END AS rgm_brand_devider
FROM brand_metrics m
CROSS JOIN rms_base_value r
CROSS JOIN rgm_base_value g
ORDER BY m.market_share DESC;

      `,
      [year, groupMain, groupSub, groupSub1, category]
    );
    console.log('Query executed successfully');
    if (rows.length === 0) {
      console.log('No data found for the given parameters');
      return res.status(404).json({ error: 'No data found for the given parameters' });
    }
    console.log(rows);
    res.json(rows);
    console.log('BCG data fetched successfully');
  } catch (err) {
    console.error('Error fetching BCG data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/ic-group', async (req, res) => {
  const search = req.query.search?.trim() ?? '';

  try {
    const { rows } = await pool.query(
      `
      SELECT code, name_1
      FROM ic_group
      WHERE ($1 = '' OR code ILIKE '%' || $1 || '%' OR name_1 ILIKE '%' || $1 || '%')
      ORDER BY code
      `,
      [search]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching ic_group:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/ic-group-sub', async (req, res) => {
  const { main_group } = req.query;

  if (!main_group) {
    return res.status(400).json({ error: 'main_group is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT code, name_1 FROM public.ic_group_sub WHERE main_group = $1 ORDER BY code',
      [main_group]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching group sub:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



router.get('/ic-group-sub2', async (req, res) => {
  const { main_group, group_sub } = req.query;
  console.log('Query Parameters:', { main_group, group_sub });
  if (!main_group || !group_sub) {
    return res.status(400).json({ error: 'main_group and group_sub are required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT code, name_1 FROM ic_group_sub2 WHERE main_group = $1 AND ic_group_sub_code = $2 ORDER BY code',
      [main_group, group_sub]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching group_sub2:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/item-category', async (req, res) => {
  const { subgroup2 } = req.query;

  console.log('Query Parameters:', { subgroup2 });

  if (!subgroup2) {
    return res.status(400).json({ error: 'subgroup2 is required' });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT item_category_name
      FROM odg_sale_detail
      WHERE itemsubgroup2 = $1
      GROUP BY item_category_name
      ORDER BY item_category_name
      `,
      [subgroup2]
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching item categories:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
