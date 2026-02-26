'use strict';
/**
 * refreshInsights worker
 * ──────────────────────
 * Generates all 3 AI insight types (forecast, inventory, festival) for a
 * store and writes them into the ai_insights table. This is the ONLY place
 * that calls Gemini server-side. The app never calls Gemini directly.
 *
 * workerData: { storeId, userId, storeType }
 */
const { workerData, parentPort } = require('worker_threads');
const pool = require('../config/database');
const { callGemini } = require('../config/gemini');
const { getUpcomingFestivals, getLastYearWindow } = require('../ai/festivalCalendar');

const { storeId, userId, storeType = 'general' } = workerData;

async function generateForecast() {
    const { rows: sales } = await pool.query(
        `SELECT date_trunc('day', transaction_date) AS day, SUM(total_amount) AS total
         FROM ledger_entries
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
           AND transaction_date >= NOW() - INTERVAL '90 days'
         GROUP BY day ORDER BY day ASC`,
        [userId, storeId]
    );

    if (!sales.length) return { forecast: [], summary: 'No sales data available yet.' };

    const prompt = `You are a demand forecasting AI for a ${storeType} retail store.
Historical daily sales data (last 90 days): ${JSON.stringify(sales)}.
Predict the daily sales for the next 30 days starting from tomorrow.
Return ONLY valid JSON:
{ "forecast": [{ "date": "YYYY-MM-DD", "predicted": 0.00, "confidenceLow": 0.00, "confidenceHigh": 0.00 }], "summary": "brief 1-sentence trend summary" }`;
    return callGemini(prompt);
}

async function generateInventory() {
    // Use stock_items if available, otherwise fall back to sales velocity
    const { rows: stockItems } = await pool.query(
        `SELECT product_name, quantity, unit, cost_price FROM stock_items
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
         ORDER BY product_name`,
        [userId, storeId]
    );

    const { rows: salesVelocity } = await pool.query(
        `SELECT li.product_name,
                SUM(li.quantity)::float AS total_qty_30d,
                (SUM(li.quantity)/30.0)::float AS daily_velocity,
                SUM(li.total_price)::float AS revenue_30d
         FROM line_items li
         JOIN ledger_entries le ON le.id = li.ledger_entry_id
         WHERE le.user_id=$1
           AND ($2::uuid IS NULL OR le.store_id=$2)
           AND le.transaction_date >= NOW() - INTERVAL '30 days'
         GROUP BY li.product_name
         ORDER BY daily_velocity DESC LIMIT 20`,
        [userId, storeId]
    );

    if (!salesVelocity.length && !stockItems.length) {
        return { alerts: [], message: 'Insufficient data. Add bills and stock items to get insights.' };
    }

    const stockContext = stockItems.length > 0
        ? `Current stock levels: ${JSON.stringify(stockItems)}. `
        : 'No stock levels recorded. ';

    const prompt = `You are an inventory analyst for a ${storeType} store.
${stockContext}30-day sales velocity data: ${JSON.stringify(salesVelocity)}.
Identify which products are at risk of stockout and recommend actions.
Return ONLY valid JSON:
{
  "alerts": [{
    "product": "name",
    "currentStock": 0,
    "dailyVelocity": 0.0,
    "estimatedDaysLeft": 0,
    "reorderQty": 0,
    "urgency": "high|medium|low",
    "recommendation": "action text"
  }]
}
Only include products with genuine stockout risk. If all fine, return empty alerts array.`;

    return callGemini(prompt);
}

async function generateFestivals() {
    const festivals = getUpcomingFestivals(30, storeType);
    if (!festivals.length) return [];

    const results = [];
    for (const festival of festivals) {
        const { start, end } = getLastYearWindow(festival);
        const { rows: lastYearSales } = await pool.query(
            `SELECT li.product_name, SUM(li.quantity) AS qty, SUM(li.total_price) AS revenue
             FROM line_items li
             JOIN ledger_entries le ON le.id = li.ledger_entry_id
             WHERE le.user_id=$1
               AND ($2::uuid IS NULL OR le.store_id=$2)
               AND le.transaction_date BETWEEN $3 AND $4
             GROUP BY li.product_name ORDER BY qty DESC LIMIT 20`,
            [userId, storeId, start, end]
        );

        const prompt = lastYearSales.length > 0
            ? `You are a retail advisor for a ${storeType} store. During last year's ${festival.name}, these products sold: ${JSON.stringify(lastYearSales)}. Recommend stock levels for the upcoming ${festival.name}. Return a JSON array: [{"product":"name","baselineQty":0,"recommendedQty":0,"percentIncrease":0,"reason":"..."}]. Top 8 items max.`
            : `You are a retail advisor for a ${storeType} store. The upcoming festival is ${festival.name} in ${Math.ceil((festival.date - new Date()) / 86400000)} days. Recommend which products to stock up on. Return a JSON array: [{"product":"name","baselineQty":0,"recommendedQty":0,"percentIncrease":0,"reason":"..."}]. Top 8 items max.`;

        try {
            const recs = await callGemini(prompt);
            results.push({
                festival: festival.name,
                date: festival.date,
                daysAway: Math.ceil((festival.date - new Date()) / 86400000),
                recommendations: Array.isArray(recs) ? recs : [],
            });
        } catch (e) {
            console.error(`[refreshInsights] Festival recs error for ${festival.name}:`, e.message);
        }
    }
    return results;
}

/**
 * Write insight to DB ONLY if the new data is genuinely useful.
 * If Gemini failed (null) or returned an error/empty payload, keep whatever
 * is already in the table — never overwrite good cached data with bad data.
 */
async function upsertInsight(type, data, ledgerCount) {
    if (data === null || data === undefined) return; // Gemini failed — keep existing

    // Detect error / insufficient-data payloads and bail out early
    const serialised = JSON.stringify(data);
    const isUseless =
        (typeof data === 'object' && !Array.isArray(data) && data.message && !data.forecast && !data.alerts) ||
        (Array.isArray(data) && data.length === 0) ||
        serialised === '{}' || serialised === '[]';

    if (isUseless) {
        console.log(`[refreshInsights] Skipping ${type} upsert — data looks empty/error, preserving existing cache.`);
        return;
    }

    await pool.query(
        `INSERT INTO ai_insights(store_id, type, data, generated_at, ledger_count_at_generation)
         VALUES($1,$2,$3,NOW(),$4)
         ON CONFLICT(store_id, type)
         DO UPDATE SET data=$3, generated_at=NOW(), ledger_count_at_generation=$4`,
        [storeId, type, serialised, ledgerCount]
    );
    console.log(`[refreshInsights] Upserted ${type} insight for store ${storeId}`);
}

async function run() {
    console.log(`[refreshInsights] Starting for store ${storeId} (${storeType})`);
    try {
        // Current ledger count — recorded alongside the insight
        const { rows: [{ count }] } = await pool.query(
            'SELECT COUNT(*)::int AS count FROM ledger_entries WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)',
            [userId, storeId]
        );
        const ledgerCount = count || 0;

        // Run all 3 insight types in sequence (Gemini rate limits make parallel risky).
        // Each one is fully independent — a failure in one does NOT affect the others,
        // and existing cached data is preserved on any Gemini error.
        const forecast = await generateForecast().catch(e => {
            console.error('[refreshInsights] Forecast failed:', e.message);
            return null;
        });
        await upsertInsight('forecast', forecast, ledgerCount);

        const inventory = await generateInventory().catch(e => {
            console.error('[refreshInsights] Inventory failed:', e.message);
            return null;
        });
        await upsertInsight('inventory', inventory, ledgerCount);

        const festivals = await generateFestivals().catch(e => {
            console.error('[refreshInsights] Festivals failed:', e.message);
            return null;
        });
        await upsertInsight('festival', festivals, ledgerCount);

        console.log(`[refreshInsights] Done for store ${storeId}`);
    } catch (e) {
        console.error('[refreshInsights] Worker error:', e.message);
    } finally {
        await pool.end();
        if (parentPort) parentPort.postMessage('done');
    }
}

run();
