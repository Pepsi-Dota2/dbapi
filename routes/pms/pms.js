const express = require('express');
const router = express.Router();
const pool = require('../../db'); // ✅ ใช้ path ที่ถูกต้องสำหรับการเชื่อมต่อฐานข้อมูล


router.get('/icgroupmain', async (req, res) => {
  try {
    const result = await pool.query("SELECT code, name_1 FROM ic_group");
    res.json(result.rows);
  } catch (error) {
    console.error(error); // ✅ แสดง error อย่างเดียว
    res.sendStatus(500);  // ✅ ไม่ต้องส่งข้อความเพิ่ม
  }
});
router.get('/icgroupsub', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from ic_group_sub where main_group=$1", [req.query.main_group]);
    res.json(result.rows);
  } catch (error) {
    console.error(error); // ✅ แสดง error อย่างเดียว
    res.sendStatus(500);  // ✅ ไม่ต้องส่งข้อความเพิ่ม
  }
});
router.get('/icgroupsub2', async (req, res) => {
  const { main_group, group_sub } = req.query;
  try {
    if (!main_group || !group_sub) {
      return res.status(400).json({ message: 'Missing main_group or group_sub' });
    }

    const result = await pool.query(
      `SELECT code, name_1 
       FROM ic_group_sub2 
       WHERE main_group = $1 AND ic_group_sub_code = $2`,
      [main_group, group_sub]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error loading ic_group_sub2', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/iccategory', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from public.ic_category");
    res.json(result.rows);
  } catch (error) {
    console.error(error); // ✅ แสดง error อย่างเดียว
    res.sendStatus(500);  // ✅ ไม่ต้องส่งข้อความเพิ่ม
  }
});
router.get('/icbrand', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from public.ic_brand");
    res.json(result.rows);
  } catch (error) {
    console.error(error); // ✅ แสดง error อย่างเดียว
    res.sendStatus(500);  // ✅ ไม่ต้องส่งข้อความเพิ่ม
  }
});
router.get('/icpattern', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from public.ic_pattern");
    res.json(result.rows);
  } catch (error) {
    console.error(error); // ✅ แสดง error อย่างเดียว
    res.sendStatus(500);  // ✅ ไม่ต้องส่งข้อความเพิ่ม
  }
});
router.get('/icsize', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from ic_size");
    res.json(result.rows);
  } catch (error) {
    console.error(error); // ✅ แสดง error อย่างเดียว
    res.sendStatus(500);  // ✅ ไม่ต้องส่งข้อความเพิ่ม
  }
});
router.get('/icdesign', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from ic_design");
    res.json(result.rows);
  } catch (error) {
    console.error(error); // ✅ แสดง error อย่างเดียว
    res.sendStatus(500);  // ✅ ไม่ต้องส่งข้อความเพิ่ม
  }
});
router.get('/icunit', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from ic_unit");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});
router.get('/icwarehouse', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from ic_warehouse");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

router.get('/icshelf', async (req, res) => {
  try {
    const result = await pool.query("select code,name_1 from ic_shelf");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

router.post('/product-draft', async (req, res) => {
  const {
    ph1, ph2, ph3, ph4, ph5, ph6, ph7, ph8,
    name_1, name_2, unit_code, wh_code, sh_code, user_created
  } = req.body;

  const insertQuery = `
    INSERT INTO public.odg_product_draft(
      ph1, ph2, ph3, ph4, ph5, ph6, ph7, ph8,
      name_1, name_2, unit_code, wh_code, sh_code, user_created
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *;
  `;

  try {
    const result = await pool.query(insertQuery, [
      ph1, ph2, ph3, ph4, ph5, ph6, ph7, ph8,
      name_1, name_2, unit_code, wh_code, sh_code, user_created
    ]);
    res.status(201).json({ message: 'Inserted successfully', data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error inserting product draft:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/product-draft/:roworder', async (req, res) => {
  const { roworder } = req.params;
  const {
    ph1, ph2, ph3, ph4, ph5, ph6, ph7, ph8,
    name_1, name_2, unit_code, wh_code, sh_code, user_created
  } = req.body;

  const updateQuery = `
    UPDATE public.odg_product_draft
    SET   
      ph1 = $1, ph2 = $2, ph3 = $3, ph4 = $4, ph5 = $5,
      ph6 = $6, ph7 = $7, ph8 = $8,
      name_1 = $9, name_2 = $10,
      unit_code = $11, wh_code = $12, sh_code = $13,
      user_created = $14
    WHERE roworder = $15
    RETURNING *;
  `;

  try {
    const result = await pool.query(updateQuery, [
      ph1, ph2, ph3, ph4, ph5, ph6, ph7, ph8,
      name_1, name_2, unit_code, wh_code, sh_code, user_created,
      roworder
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Product draft not found' });
    }

    res.json({ message: 'Updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating product draft:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/productpending', async (req, res) => {
  const { user_created } = req.query;

  const query = `
    SELECT 
      a.roworder,
      b.name_1 AS ph1,
      c.name_1 AS ph2,
      d.name_1 AS ph3,
      e.name_1 AS ph4,
      f.name_1 AS ph5,
      g.name_1 AS ph6,
      h.name_1 AS ph7,
      i.name_1 AS ph8,
      a.name_1,
      a.name_2,
      a.unit_code,
      j.name_1 AS wh,
      k.name_1 AS sh,
      account_code1,
      account_code2,
      account_code3,
      account_code4
    FROM public.odg_product_draft a
    LEFT JOIN public.ic_group b ON b.code = a.ph1
    LEFT JOIN public.ic_group_sub c ON c.code = a.ph2
    LEFT JOIN public.ic_group_sub2 d ON d.code = a.ph3
    LEFT JOIN public.ic_category e ON e.code = a.ph4
    LEFT JOIN public.ic_brand f ON f.code = a.ph5
    LEFT JOIN public.ic_pattern g ON g.code = a.ph6
    LEFT JOIN public.ic_size h ON h.code = a.ph7
    LEFT JOIN public.ic_design  i ON i.code = a.ph8
    LEFT JOIN public.ic_warehouse j ON j.code = a.wh_code
    LEFT JOIN public.ic_shelf k ON k.code = a.sh_code
    WHERE a.user_created = $1
      AND a.requst_status != '1'
  `;

  try {
    const result = await pool.query(query, [user_created]);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching product draft data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/productpending/:id', async (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT 
      a.roworder,
      b.name_1 AS ph1,
      c.name_1 AS ph2,
      d.name_1 AS ph3,
      e.name_1 AS ph4,
      f.name_1 AS ph5,
      g.name_1 AS ph6,
      h.name_1 AS ph7,
      i.name_1 AS ph8,
      a.ph1 AS ph1_code,
      a.ph2 AS ph2_code,
      a.ph3 AS ph3_code,
      a.ph4 AS ph4_code,
      a.ph5 AS ph5_code,
      a.ph6 AS ph6_code,
      a.ph7 AS ph7_code,
      a.ph8 AS ph8_code,
      a.name_1,
      a.name_2,
      a.unit_code,
      j.name_1 AS wh,
      k.name_1 AS sh,
      a.wh_code,
      a.sh_code,
      a.account_code1,
      a.account_code2,
      a.account_code3,
      a.account_code4,
      a.user_created,
      a.requst_status
    FROM public.odg_product_draft a
    LEFT JOIN public.ic_group b ON b.code = a.ph1
    LEFT JOIN public.ic_group_sub c ON c.code = a.ph2
    LEFT JOIN public.ic_group_sub2 d ON d.code = a.ph3
    LEFT JOIN public.ic_category e ON e.code = a.ph4
    LEFT JOIN public.ic_brand f ON f.code = a.ph5
    LEFT JOIN public.ic_pattern g ON g.code = a.ph6
    LEFT JOIN public.ic_size h ON h.code = a.ph7
    LEFT JOIN public.ic_design i ON i.code = a.ph8
    LEFT JOIN public.ic_warehouse j ON j.code = a.wh_code
    LEFT JOIN public.ic_shelf k ON k.code = a.sh_code
    WHERE a.roworder = $1
    LIMIT 1
  `;

  try {
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching product draft by ID:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



router.get('/productpendingaccount', async (req, res) => {
  const query = `
    SELECT 
      a.roworder,
      b.name_1 AS ph1,
      c.name_1 AS ph2,
      d.name_1 AS ph3,
      e.name_1 AS ph4,
      f.name_1 AS ph5,
      g.name_1 AS ph6,
      h.name_1 AS ph7,
      i.name_1 AS ph8,
      a.name_1,
      a.name_2,
      a.unit_code,
      j.name_1 AS wh,
      k.name_1 AS sh,
      account_code1,
      account_code2,
      account_code3,
      account_code4
    FROM public.odg_product_draft a
    LEFT JOIN public.ic_group b ON b.code = a.ph1
    LEFT JOIN public.ic_group_sub c ON c.code = a.ph2
    LEFT JOIN public.ic_group_sub2 d ON d.code = a.ph3
    LEFT JOIN public.ic_category e ON e.code = a.ph4
    LEFT JOIN public.ic_brand f ON f.code = a.ph5
    LEFT JOIN public.ic_pattern g ON g.code = a.ph6
    LEFT JOIN public.ic_size h ON h.code = a.ph7
    LEFT JOIN public.ic_design  i ON i.code = a.ph8
    LEFT JOIN public.ic_warehouse j ON j.code = a.wh_code
    LEFT JOIN public.ic_shelf k ON k.code = a.sh_code
    WHERE requst_status = 1 
    AND account_status = 0
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching product draft data:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});


router.put('/productpending/request', async (req, res) => {
  const { status, roworders } = req.body;

  if (!status || !Array.isArray(roworders) || roworders.length === 0) {
    return res.status(400).json({ message: 'Missing status or roworders' });
  }

  const query = `
    UPDATE public.odg_product_draft 
    SET requst_status = $1 
    WHERE roworder = ANY($2)
  `;

  try {
    await pool.query(query, [status, roworders]);
    res.json({ message: 'Bulk update successful' });
  } catch (error) {
    console.error('❌ Error updating statuses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


router.put('/productpending/updateaccount', async (req, res) => {
  const { account_code1, account_code2, account_code3, account_code4, roworder } = req.body;
  if (!roworder) return res.status(400).json({ message: 'Missing roworder' });

  const query = `
    UPDATE public.odg_product_draft
    SET account_code1 = $1,
        account_code2 = $2,
        account_code3 = $3,
        account_code4 = $4
    WHERE roworder = $5
    RETURNING roworder, account_code1, account_code2, account_code3, account_code4
  `;

  try {
    const result = await pool.query(query, [account_code1, account_code2, account_code3, account_code4, roworder]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No row found with the provided roworder' });
    }

    res.json({ message: 'Update successful', data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating account codes:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




router.put('/productpending/accountstatus', async (req, res) => {
  const { status, roworders } = req.body;

  if (!status || !Array.isArray(roworders) || roworders.length === 0) {
    return res.status(400).json({ message: 'Missing status or roworders' });
  }

  const query = `
    UPDATE public.odg_product_draft 
    SET account_status = $1 
    WHERE roworder = ANY($2)
    RETURNING roworder, account_status
  `;

  try {
    const result = await pool.query(query, [status, roworders]);

    res.json({
      message: 'Bulk update successful',
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error updating statuses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/productpending/updateapprove', async (req, res) => {
  const { approver, approve_status, roworders } = req.body;

  console.log('📥 Received approval request:', { approver, approve_status, roworders });

  if (!approver || !approve_status || !Array.isArray(roworders) || roworders.length === 0) {
    return res.status(400).json({ message: 'Missing required fields or invalid roworders array' });
  }

  const statusMap = { approved: 1, rejected: 2, pending: 0 };
  const statusCode = statusMap[approve_status.toLowerCase()];

  if (statusCode === undefined) {
    return res.status(400).json({ message: 'Invalid approve_status value' });
  }

  const client = await pool.connect();
  const createdCodes = [];

  try {
    await client.query('BEGIN');

    for (const roworder of roworders) {
      console.log(`🔄 Processing roworder: ${roworder}`);

      await client.query(
        `UPDATE public.odg_product_draft SET approver = $1, approve_status = $2 WHERE roworder = $3`,
        [approver, statusCode, roworder]
      );
      console.log(`✅ Updated approval for roworder: ${roworder}`);

      const { rows } = await client.query(
        `
        SELECT 
          ph3 || '-' || LPAD((
            SELECT COALESCE(MAX(split_part(code, '-', 2)::int), 0) + 1
            FROM ic_inventory 
            WHERE split_part(code, '-', 1) = odg.ph3
              AND split_part(code, '-', 2) ~ '^[0-9]+'
          )::text, 4, '0') AS new_code,
          name_1, name_2, ph1, ph2, ph3, ph4, ph5, ph6, ph7, ph8,
          unit_code, wh_code, sh_code,
          account_code1, account_code2, account_code3, account_code4
        FROM odg_product_draft odg 
        WHERE roworder = $1
        `,
        [roworder]
      );

      if (rows.length === 0) throw new Error(`No product found for roworder ${roworder}`);
      const r = rows[0];

      console.log(`📦 Data for roworder ${roworder}:`, r);

      if (!r.unit_code) throw new Error(`unit_code is missing for roworder ${roworder}`);
      if (!r.new_code) throw new Error(`new_code generation failed for roworder ${roworder}`);

      const { rows: codeExistsRows } = await client.query(
        `SELECT 1 FROM ic_inventory WHERE code = $1 LIMIT 1`,
        [r.new_code]
      );

      if (codeExistsRows.length > 0) {
        throw new Error(`Product code ${r.new_code} already exists for another roworder`);
      }

      await client.query(
        `
        INSERT INTO ic_inventory (
          code, name_1, name_2, group_main, group_sub, group_sub2,
          item_category, item_brand, item_pattern, item_size, item_design,
          unit_standard, unit_cost,
          account_code_1, account_code_2, account_code_3, account_code_4,
          unit_standard_stand_value, unit_standard_divide_value
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, 0,
          $13, $14, $15, $16,
          1.0, 1.0
        )`,
        [
          r.new_code, r.name_1, r.name_2,
          r.ph1, r.ph2, r.ph3,
          r.ph4, r.ph5, r.ph6, r.ph7, r.ph8,
          r.unit_code,
          r.account_code1, r.account_code2, r.account_code3, r.account_code4
        ]
      );
      console.log(`✅ Inserted to ic_inventory: ${r.new_code}`);

      await client.query(
        `
        INSERT INTO ic_inventory_detail (
          ic_code, start_purchase_wh, start_purchase_shelf, start_purchase_unit,
          start_sale_wh, start_sale_shelf, start_sale_unit
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [r.new_code, r.wh_code, r.sh_code, r.unit_code, r.wh_code, r.sh_code, r.unit_code]
      );
      console.log(`✅ Inserted to ic_inventory_detail for: ${r.new_code}`);

      await client.query(
        `
        INSERT INTO ic_unit_use (
          code, stand_value, divide_value, ratio, row_order, ic_code, status
        ) VALUES ($1, 1, 1, 1, 0, $2, 1)
        `,
        [r.unit_code, r.new_code]
      );
      console.log(`✅ Inserted to ic_unit_use for: ${r.new_code}`);

      await client.query(
        `
        INSERT INTO ic_wh_shelf (wh_code, shelf_code, max_point, min_point, ic_code, status)
        SELECT sh.whcode, sh.code, 0, 0, $1, 1
        FROM ic_shelf sh
        WHERE sh.whcode NOT IN ('9711')
        `,
        [r.new_code]
      );
      console.log(`✅ Inserted to ic_wh_shelf for: ${r.new_code}`);

      createdCodes.push(r.new_code);
    }

    await client.query('COMMIT');
    console.log('✅ All operations committed successfully');
    res.json({ message: 'Approval and insertions successful', createdCodes });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in approval process:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });

  } finally {
    client.release();
    console.log('🔚 Database connection released');
  }
});


router.get('/accountApprover', async (req, res) => {
  try {
    const query = "SELECT code, name_1 FROM gl_chart_of_account WHERE account_level = 6";
    const result = await pool.query(query);
    res.json(result.rows);

  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
})

router.get('/productpendingApprove', async (req, res) => {
  const { bu_code } = req.query;
  console.log(bu_code)

  const query = `
		SELECT 
  a.roworder,
  b.name_1 AS ph1,
  c.name_1 AS ph2,
  d.name_1 AS ph3,
  e.name_1 AS ph4,
  f.name_1 AS ph5,
  g.name_1 AS ph6,
  h.name_1 AS ph7,
  i.name_1 AS ph8,
  a.name_1,
  a.name_2,
  a.unit_code,
  j.name_1 AS wh,
  k.name_1 AS sh,
  a.account_code1,
  a.account_code2,
  a.account_code3,
  a.account_code4
FROM public.odg_product_draft a
LEFT JOIN public.ic_group b ON b.code = a.ph1
LEFT JOIN public.ic_group_sub c ON c.code = a.ph2
LEFT JOIN public.ic_group_sub2 d ON d.code = a.ph3
LEFT JOIN public.ic_category e ON e.code = a.ph4
LEFT JOIN public.ic_brand f ON f.code = a.ph5
LEFT JOIN public.ic_pattern g ON g.code = a.ph6
LEFT JOIN public.ic_size h ON h.code = a.ph7
LEFT JOIN public.ic_design i ON i.code = a.ph8
LEFT JOIN public.ic_warehouse j ON j.code = a.wh_code
LEFT JOIN public.ic_shelf k ON k.code = a.sh_code
WHERE 
  a.account_status = 1
  AND a.approve_status = 0
  AND a.requst_status = 1     
  AND a.user_created IN (
    SELECT code FROM erp_user WHERE bu_code = $1
  )
`;

  try {
    const values = [bu_code];
    const result = await pool.query(query, values)
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching product draft data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/historyApprove', async (req, res) => {
  const { bu_code } = req.query;

  const query = `
SELECT 
  a.roworder,
  b.name_1 AS ph1,
  c.name_1 AS ph2,
  d.name_1 AS ph3,
  e.name_1 AS ph4,
  f.name_1 AS ph5,
  g.name_1 AS ph6,
  h.name_1 AS ph7,
  i.name_1 AS ph8,
  a.name_1,
  a.name_2,
  a.unit_code,
  j.name_1 AS wh,
  k.name_1 AS sh,
  a.account_code1,
  a.account_code2,
  a.account_code3,
  a.account_code4,
  a.approver,
  u.name_1 AS approver_name,
  inv.code AS code
FROM public.odg_product_draft a
LEFT JOIN public.ic_group b ON b.code = a.ph1
LEFT JOIN public.ic_group_sub c ON c.code = a.ph2
LEFT JOIN public.ic_group_sub2 d ON d.code = a.ph3
LEFT JOIN public.ic_category e ON e.code = a.ph4
LEFT JOIN public.ic_brand f ON f.code = a.ph5
LEFT JOIN public.ic_pattern g ON g.code = a.ph6
LEFT JOIN public.ic_size h ON h.code = a.ph7
LEFT JOIN public.ic_design i ON i.code = a.ph8
LEFT JOIN public.ic_warehouse j ON j.code = a.wh_code
LEFT JOIN public.ic_shelf k ON k.code = a.sh_code
LEFT JOIN public.erp_user u ON u.code = a.approver
LEFT JOIN public.ic_inventory inv ON 
  inv.name_1 = a.name_1 AND 
  inv.name_2 = a.name_2 AND 
  inv.group_sub2 = a.ph3
WHERE a.account_status = 1 
  AND a.approve_status = 1
  AND a.user_created IN (
    SELECT code FROM erp_user WHERE bu_code = $1
  );

  `;

  try {
    const result = await pool.query(query, [bu_code]);
    console.log("result", result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching product draft data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/getproduct', async (req, res) => {
  try {
    const result = await pool.query('SELECT name_1 , code FROM public.ic_inventory');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ [DB ERROR] /getproduct:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});


module.exports = router;
