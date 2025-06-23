const express = require('express');
const router = express.Router();
const pool = require('../db');




router.get('/total', async (req, res) => {
  try {
    const total_pro = await pool.query(`SELECT
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


module.exports = router;
