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
    const { rows: stockItems } = await pool.query(
        `SELECT product_name, quantity, unit, cost_price FROM stock_items
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
         ORDER BY product_name`,
        [userId, storeId]
    );

    const { rows: salesVelocity } = await pool.query(
        `SELECT li.product_name,
                SUM(li.quantity)::float AS total_qty_30d,
                ROUND((SUM(li.quantity)/30.0)::numeric, 2)::float AS daily_velocity,
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
        return { alerts: [], message: 'Add bills and stock items to get inventory insights.' };
    }

    const stockContext = stockItems.length > 0
        ? `Current stock on hand: ${JSON.stringify(stockItems)}.`
        : 'No stock levels have been set yet — base reorder suggestion on sales velocity alone.';

    const velocityContext = salesVelocity.length > 0
        ? `Last-30-day sales velocity per product: ${JSON.stringify(salesVelocity)}.`
        : 'No sales data in last 30 days.';

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are an inventory manager for a ${storeType} retail shop. Today is ${today}.
${stockContext}
${velocityContext}

Task: For each product that is at risk of running out OR already out of stock, generate one actionable alert.
Rules:
- estimatedDaysLeft: if stock_items shows quantity AND daily_velocity > 0, compute days = quantity / daily_velocity. Round down.
- If no stock quantity recorded but product sells daily, flag as "unknown stock" with urgency medium.
- urgency: "high" if daysLeft <= 3 or out of stock. "medium" if daysLeft 4–10 or unknown. "low" if 11–20.
- reorderQty: suggest enough to last 30 days beyond current stock. Use daily_velocity * 30 - currentStock (min 1).
- estimatedReorderCost: reorderQty * cost_price if cost_price available, else null.
- actionText: ONE plain-English sentence telling the shopkeeper exactly what to do. E.g. "Order 50kg Sugar now — you have ~2 days left."
- Only include products with urgency high or medium. If everything is fine, return empty alerts.

Return ONLY valid JSON:
{
  "alerts": [{
    "product": "name",
    "currentStock": 0,
    "unit": "kg/pcs/L/etc",
    "dailyVelocity": 0.0,
    "estimatedDaysLeft": 0,
    "reorderQty": 0,
    "estimatedReorderCost": 0,
    "urgency": "high|medium",
    "actionText": "single sentence"
  }]
}`;

    return callGemini(prompt);
}

async function generateFestivals() {
    const festivals = getUpcomingFestivals(45, storeType); // Look ahead 45 days
    if (!festivals.length) return [];

    const results = [];
    for (const festival of festivals) {
        const { start, end } = getLastYearWindow(festival);
        const daysAway = Math.ceil((festival.date - new Date()) / 86400000);

        const { rows: lastYearSales } = await pool.query(
            `SELECT li.product_name,
                    SUM(li.quantity)::float AS qty_sold,
                    SUM(li.total_price)::float AS revenue,
                    AVG(li.unit_price)::float AS avg_price
             FROM line_items li
             JOIN ledger_entries le ON le.id = li.ledger_entry_id
             WHERE le.user_id=$1
               AND ($2::uuid IS NULL OR le.store_id=$2)
               AND le.transaction_date BETWEEN $3 AND $4
             GROUP BY li.product_name ORDER BY revenue DESC LIMIT 15`,
            [userId, storeId, start, end]
        );

        // Also get current stock for festival-relevant products
        const { rows: currentStock } = await pool.query(
            `SELECT product_name, quantity, unit, cost_price FROM stock_items
             WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)`,
            [userId, storeId]
        );

        const orderDeadline = new Date(festival.date);
        orderDeadline.setDate(orderDeadline.getDate() - 3);
        const orderDeadlineStr = orderDeadline.toISOString().slice(0, 10);

        const hasHistory = lastYearSales.length > 0;
        const historyContext = hasHistory
            ? `Last year during ${festival.name}, this store sold: ${JSON.stringify(lastYearSales)}.`
            : `No sales history for ${festival.name} for this store.`;
        const stockContext = currentStock.length > 0
            ? `Current stock on hand: ${JSON.stringify(currentStock)}.`
            : 'No current stock data recorded.';

        const prompt = `You are a festival sales advisor for a ${storeType} retail shop in India. Today is ${new Date().toISOString().slice(0, 10)}.
Upcoming festival: ${festival.name} — ${daysAway} days away (${festival.date.toISOString().slice(0, 10)}).
Order deadline to be ready: ${orderDeadlineStr} (3 days before festival).
${historyContext}
${stockContext}

Task: Generate specific, actionable stock preparation recommendations for ${festival.name}.
For each recommended product:
- If history exists: use actual qty_sold last year and suggest 15–30% more.
- If no history: suggest typical items for ${festival.name} in a ${storeType} store.
- stockGap: how many more units to order right now (recommendedQty - currentStock if known, else recommendedQty).
- urgencyToBuy: "today" if daysAway <= 5, "this week" if daysAway <= 10, "soon" otherwise.
- estimatedExtraRevenue: estimate total extra revenue from stocking this item for the festival (qty * avg_price). Make it realistic.
- tip: ONE practical sentence with festival-specific advice.

Also output:
- totalEstimatedBoost: sum of all estimatedExtraRevenue values (realistic total extra income if prepared well).
- festivalTip: ONE overall tip for the store owner for this festival.

Return ONLY valid JSON:
{
  "festival": "${festival.name}",
  "date": "${festival.date.toISOString().slice(0, 10)}",
  "daysAway": ${daysAway},
  "orderDeadline": "${orderDeadlineStr}",
  "totalEstimatedBoost": 0,
  "festivalTip": "one overall tip",
  "recommendations": [{
    "product": "name",
    "lastYearQtySold": 0,
    "recommendedQty": 0,
    "stockGap": 0,
    "unit": "kg/pcs/etc",
    "estimatedExtraRevenue": 0,
    "urgencyToBuy": "today|this week|soon",
    "tip": "one tip"
  }]
} Top 6 products max.`;

        try {
            const recs = await callGemini(prompt);
            // Normalise — the LLM might return the object directly or nested
            const normalised = (recs && recs.recommendations)
                ? recs
                : { festival: festival.name, date: festival.date, daysAway, recommendations: [] };

            results.push({
                ...normalised,
                festival: festival.name,
                date: festival.date,
                daysAway,
                orderDeadline: orderDeadlineStr,
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
        const { rows: [{ count }] } = await pool.query(
            'SELECT COUNT(*)::int AS count FROM ledger_entries WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)',
            [userId, storeId]
        );
        const ledgerCount = count || 0;

        // Inventory first (most critical for day-to-day)
        const inventory = await generateInventory().catch(e => {
            console.error('[refreshInsights] Inventory failed:', e.message);
            return null;
        });
        await upsertInsight('inventory', inventory, ledgerCount);

        // Festival opportunities
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
