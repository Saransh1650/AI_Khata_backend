'use strict';
const { workerData, parentPort } = require('worker_threads');
const pool = require('../config/database');
const { callBedrock } = require('../config/bedrock');

async function run() {
    const { jobId, userId, storeId, horizon = 30, storeType = 'general' } = workerData;

    try {
        await pool.query("UPDATE ai_jobs SET status='PROCESSING' WHERE id=$1", [jobId]);

        // Load last 90 days of daily sales
        const { rows: sales } = await pool.query(
            `SELECT date_trunc('day', transaction_date) AS day, SUM(total_amount) AS total
       FROM ledger_entries
       WHERE user_id=$1
         AND ($2::uuid IS NULL OR store_id=$2)
         AND transaction_date >= NOW() - INTERVAL '90 days'
       GROUP BY day ORDER BY day ASC`,
            [userId, storeId]
        );

        const prompt = `You are a demand forecasting AI for a ${storeType} retail store.
Historical daily sales data (last 90 days): ${JSON.stringify(sales)}.
Predict the daily sales for the next ${horizon} days starting from tomorrow.
Return ONLY valid JSON with this exact structure:
{
  "forecast": [
    { "date": "YYYY-MM-DD", "predicted": 0.00, "confidenceLow": 0.00, "confidenceHigh": 0.00 }
  ],
  "summary": "brief 1-sentence trend summary"
}`;

        const result = await callBedrock(prompt);

        await pool.query(
            'INSERT INTO ai_results(job_id, data, confidence) VALUES($1,$2,$3)',
            [jobId, result, 0.75]
        );
        await pool.query(
            "UPDATE ai_jobs SET status='COMPLETED', completed_at=NOW() WHERE id=$1", [jobId]
        );
    } catch (e) {
        console.error('Forecast Worker failed:', e.message);
        await pool.query(
            "UPDATE ai_jobs SET status='FAILED', error=$2 WHERE id=$1", [jobId, e.message]
        );
    } finally {
        await pool.end();
        if (parentPort) parentPort.postMessage('done');
    }
}

run();
