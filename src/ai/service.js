'use strict';
const path = require('path');
const { Worker } = require('worker_threads');
const pool = require('../config/database');
const { callGemini } = require('../config/gemini');
const { getUpcomingFestivals, getLastYearWindow } = require('./festivalCalendar');

// ── Festival recs cache (in-memory, 24-hour TTL per storeType) ────────────────
const FESTIVAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const festivalCache = new Map(); // key: storeType → { data, expiresAt }
const festivalInFlight = new Map(); // key: storeType → Promise (dedup concurrent calls)

// ── Job helpers ───────────────────────────────────────────────────────────────

async function createJob(userId, storeId, jobType, config) {
    const { rows: [job] } = await pool.query(
        'INSERT INTO ai_jobs(user_id,store_id,job_type,config) VALUES($1,$2,$3,$4) RETURNING *',
        [userId, storeId, jobType, config]
    );
    return job;
}

async function getJob(jobId, userId) {
    const { rows } = await pool.query(
        'SELECT * FROM ai_jobs WHERE id=$1 AND user_id=$2', [jobId, userId]
    );
    return rows[0] || null;
}

async function getJobResult(jobId, userId) {
    const job = await getJob(jobId, userId);
    if (!job) return null;
    const { rows } = await pool.query(
        'SELECT * FROM ai_results WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1', [jobId]
    );
    return { job, result: rows[0] || null };
}

// ── Dispatch workers ──────────────────────────────────────────────────────────

function dispatchWorker(workerFile, workerData) {
    const worker = new Worker(path.join(__dirname, '../workers', workerFile), { workerData });
    worker.on('error', (e) => console.error(`Worker ${workerFile} error:`, e));
}

// ── Forecast ──────────────────────────────────────────────────────────────────

async function requestForecast(userId, storeId, { horizon = 30, storeType } = {}) {
    const job = await createJob(userId, storeId, 'forecast', { horizon, storeType });
    dispatchWorker('forecastWorker.js', { jobId: job.id, userId, storeId, horizon, storeType });
    return job;
}

// ── Inventory analysis ────────────────────────────────────────────────────────

async function requestInventoryAnalysis(userId, storeId, { storeType } = {}) {
    const job = await createJob(userId, storeId, 'inventory', { storeType });
    dispatchWorker('inventoryWorker.js', { jobId: job.id, userId, storeId, storeType });
    return job;
}

// ── Festival recommendations (synchronous — fast) ─────────────────────────────

async function _fetchFestivalRecommendations(userId, storeId, storeType) {
    const festivals = getUpcomingFestivals(30, storeType);
    if (!festivals.length) return [];

    const results = [];

    for (const festival of festivals) {
        const { start, end } = getLastYearWindow(festival);

        // Fetch last year's sales for this festival window
        const { rows: lastYearSales } = await pool.query(
            `SELECT li.product_name, SUM(li.quantity) AS qty, SUM(li.total_price) AS revenue
       FROM line_items li
       JOIN ledger_entries le ON le.id = li.ledger_entry_id
       WHERE le.user_id=$1
         AND ($2::uuid IS NULL OR le.store_id=$2)
         AND le.transaction_date BETWEEN $3 AND $4
       GROUP BY li.product_name
       ORDER BY qty DESC LIMIT 20`,
            [userId, storeId, start, end]
        );

        // Fetch 30-day rolling baseline
        const { rows: baseline } = await pool.query(
            `SELECT li.product_name, SUM(li.quantity) AS qty
       FROM line_items li
       JOIN ledger_entries le ON le.id = li.ledger_entry_id
       WHERE le.user_id=$1
         AND ($2::uuid IS NULL OR le.store_id=$2)
         AND le.transaction_date >= NOW() - INTERVAL '30 days'
       GROUP BY li.product_name`,
            [userId, storeId]
        );

        const prompt = lastYearSales.length > 0
            ? `You are a retail advisor for a ${storeType} store. During last year's ${festival.name} festival (${festival.windowDays}-day window), these products sold: ${JSON.stringify(lastYearSales)}. The 30-day baseline sales are: ${JSON.stringify(baseline)}. Recommend stock levels for the upcoming ${festival.name}. Return a JSON array: [{"product":"name","baselineQty":0,"recommendedQty":0,"percentIncrease":0,"reason":"..."}]. Only include products relevant to a ${storeType} store. Keep array concise (top 8 items max.).`
            : `You are a retail advisor for a ${storeType} store. The upcoming festival is ${festival.name} in ${Math.ceil((festival.date - new Date()) / 86400000)} days. Recommend which products a ${storeType} store should stock up on. Return a JSON array: [{"product":"name","baselineQty":0,"recommendedQty":0,"percentIncrease":0,"reason":"..."}]. Top 8 items max.`;

        try {
            const recommendations = await callGemini(prompt);
            results.push({
                festival: festival.name,
                date: festival.date,
                daysAway: Math.ceil((festival.date - new Date()) / 86400000),
                recommendations: Array.isArray(recommendations) ? recommendations : [],
            });
        } catch (e) {
            console.error(`Gemini festival recs error for ${festival.name}:`, e.message);
        }
    }

    return results;
}

async function getFestivalRecommendations(userId, storeId, storeType) {
    const cacheKey = storeType || 'generic';

    // 1. Return cached result if still fresh
    const cached = festivalCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
    }

    // 2. If a fetch is already in-flight for this storeType, share its promise
    //    (prevents N concurrent requests from each firing N Gemini calls)
    if (festivalInFlight.has(cacheKey)) {
        return festivalInFlight.get(cacheKey);
    }

    // 3. Start the fetch, register it as in-flight
    const promise = _fetchFestivalRecommendations(userId, storeId, storeType)
        .then((data) => {
            festivalCache.set(cacheKey, { data, expiresAt: Date.now() + FESTIVAL_CACHE_TTL_MS });
            festivalInFlight.delete(cacheKey);
            return data;
        })
        .catch((err) => {
            festivalInFlight.delete(cacheKey);
            throw err;
        });

    festivalInFlight.set(cacheKey, promise);
    return promise;
}

module.exports = { requestForecast, requestInventoryAnalysis, getFestivalRecommendations, getJob, getJobResult };
