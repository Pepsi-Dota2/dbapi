const express = require('express');
const router = express.Router();
const pool = require('../../db1');  // PostgreSQL connection setup
require('dotenv').config();


router.get('/warehouse', async (req, res) => {
  try {
    const query = `select code,name_1 from ic_warehouse order by code ASC`;
    const result = await pool.query(query);
    res.json({data: result.rows});

  } catch (err) {
    console.error('Error fetching monthly sales:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
// / GET /location/:wh_code
router.get('/location/:wh_code', async (req, res) => {
  const { wh_code } = req.params;
  try {
    const query = `SELECT code, name_1 FROM ic_shelf WHERE whcode = $1 ORDER BY code ASC`;
    const result = await pool.query(query, [wh_code]);
    res.json({data: result.rows});
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

 router.post('/stock', async (req, res) => {
  const body = req.body;

  const wh_code = body.wh_code;
  const sh_code = body.sh_code;
  const cust_group_main = body.cust_group_main;
  const cust_group_sub = body.cust_group_sub;
  const currency_code = body.currency_code;
  const page = parseInt(body.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const search_query = body.query || '';

  try {
    const countParams = [wh_code, sh_code];
    let countQuery = `
      WITH stock_balances AS (
        SELECT ic_code FROM sml_ic_function_stock_balance_warehouse_location('2099-12-31', '', $1, $2)
        WHERE balance_qty > 0
      )
      SELECT COUNT(*) FROM ic_inventory a
      JOIN stock_balances sb ON sb.ic_code = a.code
      WHERE 1=1
    `;
    if (search_query.trim() !== '') {
      countQuery += ` AND (a.name_1 ILIKE $3 OR a.code ILIKE $3)`;
      countParams.push(`%${search_query}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total_rows = parseInt(countResult.rows[0].count);

    const dataParams = [wh_code, sh_code, cust_group_main, cust_group_sub, currency_code];
    let dataQuery = `
      WITH stock_balances AS (
        SELECT ic_code, balance_qty::int AS balance_qty
        FROM sml_ic_function_stock_balance_warehouse_location('2099-12-31', '', $1, $2)
        WHERE balance_qty > 0
      ),
      latest_prices AS (
        SELECT DISTINCT ON (ic_code) ic_code, sale_price1, unit_code
        FROM ic_inventory_price
        WHERE current_date BETWEEN from_date AND to_date
          AND cust_group_1 = $3
          AND cust_group_2 = $4
          AND currency_code = $5
        ORDER BY ic_code, roworder DESC
      )
      SELECT a.code, a.name_1, a.unit_cost AS unit_code, sb.balance_qty, 
      COALESCE(lp.sale_price1, 0) AS sale_price1
      , a.average_cost, h.url_image
      FROM ic_inventory a
      JOIN stock_balances sb ON sb.ic_code = a.code
      LEFT JOIN latest_prices lp ON lp.ic_code = a.code AND lp.unit_code = a.unit_cost
      LEFT JOIN product_image h ON h.ic_code = a.code
      WHERE 1=1
    `;
    if (search_query.trim() !== '') {
      dataQuery += ` AND (a.name_1 ILIKE $6 OR a.code ILIKE $6)`;
      dataParams.push(`%${search_query}%`);
    }

    dataQuery += ` ORDER BY a.name_1 LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`;
    dataParams.push(limit, offset);

    const dataResult = await pool.query(dataQuery, dataParams);

    res.json({
      data: dataResult.rows,
      page: page,
      limit: limit,
      total_rows: total_rows,
      has_more: offset + limit < total_rows
    });
  } catch (err) {
    console.error('Error executing stock query:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
router.post('/promotion_item', async (req, res) => {
  const { group_sub_1, item_code } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sql = `
      (
        SELECT 
          from_date, to_date, 
          'P00' AS pro_type, 
          'ສິນຄ້າຂາຍປົກກະຕິ' AS pro_type_name, 
          ic_code AS ic_main_code, 
          b.name_1 AS ic_main_name, 
          unit_code AS main_unit_code,
          1 AS main_qty, 
          sale_price1 AS ic_main_price,
          NULL AS ic_code, NULL AS ic_name, NULL AS unit_code, NULL AS qty, NULL AS price
        FROM ic_inventory_price a
        LEFT JOIN ic_inventory b ON b.code = a.ic_code
        WHERE currency_code = '02'
          AND cust_group_2 = $1
          AND CURRENT_DATE BETWEEN from_date AND to_date
          AND ic_code = $2
        ORDER BY a.roworder DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT 
          a.from_date, a.to_date, 
          a.pro_type,
          (SELECT name_1 FROM promotion_retail_type WHERE code = a.pro_type) AS pro_type_name,
          a.ic_main_code,
          b.name_1 AS ic_name,
          a.main_unit_code,
          1 AS main_qty,
          CASE 
            WHEN $1 = '10103' AND main_member_gold > 0 THEN main_member_gold
            WHEN $1 = '10104' AND main_member_platinum > 0 THEN main_member_platinum
            WHEN $1 = '10105' AND main_member_black > 0 THEN main_member_black
            ELSE COALESCE((
              SELECT sale_price1
              FROM ic_inventory_price
              WHERE ic_code = a.ic_main_code
                AND currency_code = '02'
                AND cust_group_2 = $1
                AND CURRENT_DATE BETWEEN from_date AND to_date
              ORDER BY roworder DESC
              LIMIT 1
            ), 0)
          END AS ic_main_price,
          a.ic_code, a.ic_name, a.unit_code,
          COALESCE(a.qty, 0) AS qty,
          CASE 
            WHEN $1 = '10103' AND member_gold > 0 THEN member_gold
            WHEN $1 = '10104' AND member_platinum > 0 THEN member_platinum
            WHEN $1 = '10105' AND member_black > 0 THEN member_black
            ELSE price
          END AS price
        FROM promotion_retail a
        LEFT JOIN ic_inventory b ON b.code = a.ic_main_code
        WHERE a.ic_main_code = $2
          AND (
            (a.pro_type IN ('P01','P02','P03') AND CURRENT_DATE BETWEEN a.from_date AND a.to_date)
            OR (a.pro_type = 'P04' AND NOW() BETWEEN a.from_date AND a.to_date)
          )
        ORDER BY a.pro_type, a.roworder
      )
    `;

    const result = await client.query(sql, [group_sub_1, item_code]);

    await client.query('COMMIT');
    res.json({ list: result.rows });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});
// router.post('/promotion_item', async (req, res) => {
//   const body = req.body;
//   const client = await pool.connect();

//   try {
//     const query = `
//       SELECT
//         ROW_NUMBER () OVER (ORDER BY pro_code ASC) as no,
//         pro_code,
//         TO_CHAR(from_date, 'DD-MM-YYYY') as from_date,
//         TO_CHAR(to_date, 'DD-MM-YYYY') as to_date,
//         ic_code,
//         ic_name,
//         1 as qty,
//         unit_code,
//         CASE 
//           WHEN $1 = '10103' AND member_gold > 0 THEN member_gold
//           WHEN $1 = '10104' AND member_platinum > 0 THEN member_platinum
//           WHEN $1 = '10105' AND member_black > 0 THEN member_black
//           ELSE price 
//         END AS price,
//         roworder,
//         pro_type,
//         (SELECT name_1 FROM promotion_retail_type WHERE code = a.pro_type) as pro_type_name,
//         a.pro_name
//       FROM promotion_retail a 
//       WHERE CURRENT_DATE BETWEEN from_date::date AND to_date::date
//         AND ic_main_code = $2
//     `;

//     const values = [body.group_sub_1, body.item_code];
//     const result = await client.query(query, values);

//     res.json({ data: result.rows });

//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });

//   } finally {
//     client.release();
//   }
// });


module.exports = router;
