const express = require('express');
const router = express.Router();
const pool = require('../../db1');  // PostgreSQL connection setup
require('dotenv').config();

// GET /pos/customer
router.get('/customer', async (req, res) => {
  const query = req.query.query || '';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let sql, params;
    if (query === '') {
      sql = `
        SELECT 
          a.code AS cust_code,
          a.name_1 AS cust_name,
          address,
          COALESCE(f.name_1, '') || '-' || COALESCE(e.name_1, '') || '-' || COALESCE(d.name_1, '') AS adress1,
          COALESCE(telephone, '') AS telephone,
          area_code,
          logistic_area,
		  group_main,
          h.name_1 AS group_main_name,
		  group_sub_1,
          i.name_1 AS group_sub_name,
          c.credit_status,
          latitude || ',' || longitude AS latlng
        FROM ar_customer a
        LEFT JOIN ar_customer_detail c ON a.code = c.ar_code
        LEFT JOIN erp_province d ON d.code = a.province
        LEFT JOIN erp_amper e ON e.code = a.amper AND e.province = a.province
        LEFT JOIN erp_tambon f ON f.code = a.tambon AND f.province = a.province AND f.amper = a.amper
        LEFT JOIN ar_group h ON h.code = c.group_main
        LEFT JOIN ar_group_sub i ON i.code = c.group_sub_1
        		where reg_group='member'
      `;
      params = [];
    } else {
      sql = `
        SELECT 
          a.code AS cust_code,
          a.name_1 AS cust_name,
          address,
          COALESCE(f.name_1, '') || '-' || COALESCE(e.name_1, '') || '-' || COALESCE(d.name_1, '') AS adress1,
          COALESCE(telephone, '') AS telephone,
          area_code,
          logistic_area,
		  group_main,
          h.name_1 AS group_main_name,
		  group_sub_1,
          i.name_1 AS group_sub_name,
          c.credit_status,
          latitude || ',' || longitude AS latlng
        FROM ar_customer a
        LEFT JOIN ar_customer_detail c ON a.code = c.ar_code
        LEFT JOIN erp_province d ON d.code = a.province
        LEFT JOIN erp_amper e ON e.code = a.amper AND e.province = a.province
        LEFT JOIN erp_tambon f ON f.code = a.tambon AND f.province = a.province AND f.amper = a.amper
        LEFT JOIN ar_group h ON h.code = c.group_main
        LEFT JOIN ar_group_sub i ON i.code = c.group_sub_1
        WHERE a.name_1 ILIKE $1 OR a.code ILIKE $1
      `;
      params = [`%${query}%`];
    }

    const result = await client.query(sql, params);
    await client.query('COMMIT');

    res.json({ data: result.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error fetching customers:', err);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
