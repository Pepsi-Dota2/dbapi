const express = require('express');
const router = express.Router();
const pool = require('../../db1');  // PostgreSQL connection setup
const moment = require('moment');  // <-- เพิ่มบรรทัดนี้
require('dotenv').config();

router.get('/docno', async (req, res) => {
  const client = await pool.connect();

  try {
    const now = moment();
    const year_month = now.format('YYYYMM');
    const prefix = 'POM';

    // Query หา doc_no สูงสุดของเดือนนี้
    const query = `
      SELECT COALESCE(MAX(SUBSTRING(doc_no, 5)), '0')::bigint AS doc_no
      FROM ic_trans
      WHERE doc_format_code = $1
      AND TO_CHAR(doc_date, 'YYYY-MM') = TO_CHAR(current_date, 'YYYY-MM')
    `;
    const result = await client.query(query, [prefix]);
    const current_no = result.rows[0]?.doc_no || 0;

    const next_no = parseInt(current_no) + 1;
    const new_doc_no = `${prefix}${year_month}${next_no.toString().padStart(5, '0')}`;

    res.json({ data: new_doc_no });

  } catch (err) {
    console.error('Error generating doc_no:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});


router.post('/saveBill', async (req, res) => {
  const client = await pool.connect();
  const body = req.body;
  console.log('Received body:', body);
  try {
    await client.query('BEGIN');

    const now = moment();
    const doc_date = now.format('YYYY-MM-DD');
    const doc_time = now.format('HH:mm');

    // ic_trans
    const sql_trans = `
      INSERT INTO ic_trans (
        trans_type, trans_flag, doc_date, doc_no, vat_type, cust_code, branch_code,
        currency_code, total_value, total_amount, doc_time, doc_format_code, creator_code,
        total_amount_2, total_value_2, inquiry_type, sale_code, side_code, department_code
      ) VALUES (2, 44, $1, $2, 2, $3, '00', '01', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;
    const params_trans = [
      doc_date, body.doc_no, body.cust_code,
      body.total_amount, body.total_amount, doc_time, 'POSKL', body.sale_code,
      body.total_amount, body.total_amount, '1', body.sale_code, body.side_code, body.department_code
    ];
    await client.query(sql_trans, params_trans);

    // ic_trans_detail
    for (const item of body.bill) {
      const sql_detail = `
        INSERT INTO ic_trans_detail (
          trans_type, trans_flag, doc_date, doc_no, cust_code, item_code, item_name,
          unit_code, qty, price, discount, sum_amount, branch_code, wh_code, shelf_code,
          calc_flag, doc_time, inquiry_type, stand_value, divide_value, doc_date_calc,
          doc_time_calc, sum_of_cost, discount_amount, price_2, sum_amount_2, item_code_main, remark
        ) VALUES (2, 44, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '00', $11, $12, -1, $13, '1', 1, 1, $14, $15, $16, $17, $18, $19, $20, $21)
      `;
      const params_detail = [
        doc_date, body.doc_no, body.cust_code, item.item_code, item.item_name, item.unit_code,
        item.qty, item.price, item.discount, item.sum_amount, body.wh_code, body.sh_code,
        doc_time, doc_date, doc_time, item.average_cost, item.discount_amount, item.price,
        item.sum_amount, item.item_main_code, item.product_type
      ];
      await client.query(sql_detail, params_detail);
    }

    // cb_trans
    const sql_cb_trans = `
      INSERT INTO cb_trans (
        trans_type, trans_flag, doc_date, doc_no, total_amount, total_net_amount,
        tranfer_amount, total_amount_pay, ap_ar_code, pay_type, doc_format_code
      ) VALUES (2, 44, $1, $2, $3, $4, $5, $6, $7, $8, 'POSKL')
    `;
    await client.query(sql_cb_trans, [
      doc_date, body.doc_no, body.total_amount, body.total_amount,
      body.total_amount, body.total_amount, body.cust_code, 1
    ]);

    // cb_trans_detail
    const sql_cb_trans_detail = `
      INSERT INTO cb_trans_detail (
        trans_type, trans_flag, doc_date, doc_no, trans_number, bank_code, bank_branch,
        amount, chq_due_date, doc_type, currency_code, sum_amount_2
      ) VALUES (2, 44, $1, $2, $3, $4, $5, $6, $7, 1, '01', $8)
    `;
    await client.query(sql_cb_trans_detail, [
      doc_date, body.doc_no, '1010201', '1010201', 'BCEL01',
      body.total_amount_2, doc_date, body.total_amount
    ]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transaction committed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving bill:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
