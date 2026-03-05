'use strict';
const { workerData, parentPort } = require('worker_threads');
const pool = require('../config/database');
const { callBedrock } = require('../config/bedrock');

async function run() {
    const { jobId, userId, storeId, storeType = 'general' } = workerData;

    try {
        await pool.query("UPDATE ai_jobs SET status='PROCESSING' WHERE id=$1", [jobId]);

        // Get top 20 products with 30-day velocity
        const { rows: products } = await pool.query(
            `SELECT
         li.product_name,
         SUM(li.quantity) AS total_qty_30d,
         SUM(li.quantity) / 30.0 AS daily_velocity,
         SUM(li.total_price) AS revenue_30d
       FROM line_items li
       JOIN ledger_entries le ON le.id = li.ledger_entry_id
       WHERE le.user_id=$1
         AND ($2::uuid IS NULL OR le.store_id=$2)
         AND le.transaction_date >= NOW() - INTERVAL '30 days'
       GROUP BY li.product_name
       ORDER BY daily_velocity DESC
       LIMIT 20`,
            [userId, storeId]
        );

        if (!products.length) {
            await pool.query('INSERT INTO ai_results(job_id,data) VALUES($1,$2)', [jobId, { alerts: [], message: 'Insufficient sales data' }]);
            await pool.query("UPDATE ai_jobs SET status='COMPLETED', completed_at=NOW() WHERE id=$1", [jobId]);
            return;
        }

        const prompt = `You are an inventory analyst for a ${storeType} store.
Products with their 30-day sales velocity (qty/day): ${JSON.stringify(products)}.
Identify which products are at risk of stockout and recommend actions.
Return ONLY valid JSON:
{
  "alerts": [
    {
      "product": "name",
      "dailyVelocity": 0.0,
      "estimatedDaysLeft": 0,
      "reorderQty": 0,
      "urgency": "high|medium|low",
      "recommendation": "action text"
    }
  ]
}
Only include products with genuine stockout risk. If all look fine, return empty alerts array.`;

        const result = await callBedrock(prompt);

        await pool.query('INSERT INTO ai_results(job_id,data) VALUES($1,$2)', [jobId, result]);
        await pool.query("UPDATE ai_jobs SET status='COMPLETED', completed_at=NOW() WHERE id=$1", [jobId]);
    } catch (e) {
        console.error('Inventory Worker failed:', e.message);
        await pool.query("UPDATE ai_jobs SET status='FAILED', error=$2 WHERE id=$1", [jobId, e.message]);
    } finally {
        await pool.end();
        if (parentPort) parentPort.postMessage('done');
    }
}

run();
