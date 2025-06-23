const express = require('express');
const router = express.Router();
const pool = require('../db');




router.get('/salewithcost', async (req, res) => {
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

router.get('/countcost', async (req, res) => {
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
        WHERE yeardoc in ('2025', '2024')
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
        WHERE yeardoc  in ('2025', '2024')
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
router.get('/groupmain', async (req, res) => {
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
router.get('/groupsub', async (req, res) => {
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
router.get('/groupsub2', async (req, res) => {
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


// router.post('/salewithcost-zero', async (req, res) => {
//   const {
//     groupMain,
//     groupSub,
//     groupSub2,
//     page = 1,
//     limit = 20,
//     export: isExport,
//   } = req.body;

//   const values = [];
//   let whereClauses = [`yeardoc IN ('2024', '2025')`];

//   // Filter conditions
//   if (groupMain) {
//     values.push(groupMain);
//     whereClauses.push(`itemmaingroup = $${values.length}`);
//   }
//   if (groupSub) {
//     values.push(groupSub);
//     whereClauses.push(`itemsubgroup = $${values.length}`);
//   }
//   if (groupSub2) {
//     values.push(groupSub2);
//     whereClauses.push(`itemsubgroup2 = $${values.length}`);
//   }

//   const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

//   // Pagination logic
//   let paginationSQL = '';
//   if (!isExport) {
//     const offset = (page - 1) * limit;
//     paginationSQL = `LIMIT ${limit} OFFSET ${offset}`;
//   }

//   const query = `
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
//         qty * CASE 
//           WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
//           THEN COALESCE(cost_thb_pakse, 0)
//           ELSE cost_thb_vte 
//         END
//       ) AS total_cost,
//       to_char(min(doc_date),'dd-MM-yyyy') as first_sale,
//       to_char(max(doc_date),'dd-MM-yyyy') as last_sale
//     FROM odg_sale_detail
//     ${whereSQL}
//     GROUP BY item_code, item_name, itemmaingroup, itemsubgroup, itemsubgroup2, unit_code
//     HAVING
//       SUM(
//         qty * CASE 
//           WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
//           THEN COALESCE(cost_thb_pakse, 0)
//           ELSE cost_thb_vte 
//         END
//       ) = 0
//     ORDER BY item_name
//     ${paginationSQL}
//   `;

//   try {
//     const result = await pool.query(query, values);
//     res.json(result.rows);
//   } catch (err) {
//     console.error('Query error:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

router.get('/salewithcost-zero', async (req, res) => {
  try {
    const {
      groupMain,
      groupSub,
      groupSub2,
      page = 1,
      limit = 30,
      export: isExport,
    } = req.query;

    const values = [];
    const whereClauses = [`yeardoc IN ('2024', '2025')`];

    if (groupMain) {
      values.push(groupMain);
      whereClauses.push(`itemmaingroup = $${values.length}`);
    }
    if (groupSub) {
      values.push(groupSub);
      whereClauses.push(`itemsubgroup = $${values.length}`);
    }
    if (groupSub2) {
      values.push(groupSub2);
      whereClauses.push(`itemsubgroup2 = $${values.length}`);
    }

    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const exportMode = isExport === '1' || isExport === 'true';

    // Pagination SQL
    let paginationSQL = '';
    if (!exportMode) {
      const offset = (parseInt(page) - 1) * parseInt(limit);
      paginationSQL = `LIMIT ${limit} OFFSET ${offset}`;
    }

    const query = `
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
        TO_CHAR(MIN(doc_date), 'dd-MM-yyyy') AS first_sale,
        TO_CHAR(MAX(doc_date), 'dd-MM-yyyy') AS last_sale
      FROM odg_sale_detail
      ${whereSQL}
      GROUP BY item_code, item_name, itemmaingroup, itemsubgroup, itemsubgroup2, unit_code
      HAVING
        SUM(
          qty * CASE 
            WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
            THEN COALESCE(cost_thb_pakse, 0)
            ELSE cost_thb_vte 
          END
        ) = 0
      ORDER BY item_name
      ${paginationSQL}
    `;

    const dataResult = await pool.query(query, values);

    if (exportMode) {
      return res.json({ data: dataResult.rows });
    }

    // Count total for pagination
    const countQuery = `
      SELECT COUNT(*) FROM (
        SELECT 1
        FROM odg_sale_detail
        ${whereSQL}
        GROUP BY item_code, item_name, itemmaingroup, itemsubgroup, itemsubgroup2, unit_code
        HAVING
          SUM(
            qty * CASE 
              WHEN cost_thb_vte = 0 OR cost_thb_vte IS NULL 
              THEN COALESCE(cost_thb_pakse, 0)
              ELSE cost_thb_vte 
            END
          ) = 0
      ) AS subquery;
    `;
    const countResult = await pool.query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      data: dataResult.rows,
      totalPages,
      totalCount,
    });
  } catch (err) {
    console.error('Error fetching zero-cost items:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.get('/salewithcost-under', async (req, res) => {
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

router.get('/summarygm', async (req, res) => {
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


router.get('/item-cost-status', async (req, res) => {
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


router.get('/odgoverall', async (req, res) => {

  try {
    // ພາບລວມບໍລິສັດ
    const overall = await pool.query(`
            WITH price_data AS (
              SELECT
                inv.code,
                COALESCE(p.sale_price1, 0) AS sale_price1
              FROM ic_inventory AS inv
              LEFT JOIN LATERAL (
                SELECT sale_price1
                FROM ic_inventory_price
                WHERE cust_group_1 = '9'
                  AND ic_code = inv.code
                ORDER BY roworder DESC
                LIMIT 1
              ) AS p ON TRUE
              WHERE inv.group_main IN ('11','12','13','14')and item_type !='3'
            )

            SELECT
              COUNT(*) AS total_items,
              COUNT(*) FILTER (WHERE sale_price1 > 0) AS items_with_price,
              COUNT(*) FILTER (WHERE sale_price1 = 0) AS items_without_price
            FROM price_data;
    `);
    // ຕາມກູ່ມຫຼັກ
    const bygroupmain = await pool.query(`
          WITH price_data AS (
            SELECT
              inv.group_main,
              inv.code,
              COALESCE(p.sale_price1, 0) AS sale_price1
            FROM ic_inventory AS inv
            LEFT JOIN LATERAL (
              SELECT sale_price1
              FROM ic_inventory_price
              WHERE cust_group_1 = '9'
                AND ic_code = inv.code
              ORDER BY roworder DESC
              LIMIT 1
            ) AS p ON TRUE
            WHERE inv.group_main IN ('11','12','13','14') and item_type !='3'
          )

          SELECT
            g.name_1 AS group_main_name,
            pd.group_main,
            COUNT(*) AS total_items,
            COUNT(*) FILTER (WHERE sale_price1 > 0) AS items_with_price,
            COUNT(*) FILTER (WHERE sale_price1 = 0) AS items_without_price
          FROM price_data pd
          LEFT JOIN ic_group g ON g.code = pd.group_main
          GROUP BY pd.group_main, g.name_1
          ORDER BY pd.group_main;
    `);
    res.json({
      success: true,
      overall: overall.rows[0],
      bygroupmain: bygroupmain.rows,
    });

  } catch (err) {
    console.error('❌ Error fetching item categories:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;