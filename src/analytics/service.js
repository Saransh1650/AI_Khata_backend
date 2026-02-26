'use strict';
const pool = require('../config/database');

async function getSalesTrends(userId, { storeId, days = 30 } = {}) {
    const params = [userId, days];
    let q = `
    SELECT
      date_trunc('day', transaction_date) AS day,
      SUM(total_amount) AS total,
      COUNT(*) AS transaction_count
    FROM ledger_entries
    WHERE user_id=$1
      AND transaction_date >= NOW() - ($2 || ' days')::INTERVAL
  `;
    if (storeId) { params.push(storeId); q += ` AND store_id=$${params.length}`; }
    q += ' GROUP BY day ORDER BY day ASC';
    const { rows } = await pool.query(q, params);
    return rows;
}

async function getProductRankings(userId, { storeId, days = 30, limit = 10 } = {}) {
    const params = [userId, days];
    let q = `
    SELECT
      li.product_name,
      SUM(li.quantity) AS units_sold,
      SUM(li.total_price) AS revenue,
      COUNT(DISTINCT le.id) AS transaction_count,
      ROUND(SUM(li.total_price) * 100.0 / NULLIF(SUM(SUM(li.total_price)) OVER (), 0), 2) AS pct_of_total
    FROM line_items li
    JOIN ledger_entries le ON le.id = li.ledger_entry_id
    WHERE le.user_id=$1
      AND le.transaction_date >= NOW() - ($2 || ' days')::INTERVAL
  `;
    if (storeId) { params.push(storeId); q += ` AND le.store_id=$${params.length}`; }
    q += ` GROUP BY li.product_name ORDER BY revenue DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const { rows } = await pool.query(q, params);
    return rows;
}

async function getCustomerActivity(userId, { storeId, days = 30 } = {}) {
    const params = [userId, days];
    let q = `
    SELECT
      EXTRACT(DOW FROM transaction_date) AS day_of_week,
      EXTRACT(HOUR FROM transaction_date) AS hour,
      COUNT(*) AS transaction_count,
      AVG(total_amount) AS avg_transaction_value
    FROM ledger_entries
    WHERE user_id=$1
      AND transaction_date >= NOW() - ($2 || ' days')::INTERVAL
  `;
    if (storeId) { params.push(storeId); q += ` AND store_id=$${params.length}`; }
    q += ' GROUP BY day_of_week, hour ORDER BY transaction_count DESC';
    const { rows } = await pool.query(q, params);
    return rows;
}

module.exports = { getSalesTrends, getProductRankings, getCustomerActivity };
