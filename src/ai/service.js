'use strict';
const path = require('path');
const { Worker } = require('worker_threads');
const pool = require('../config/database');
const { getUpcomingFestivals, getLastYearWindow } = require('./festivalCalendar');

// ── Constants ─────────────────────────────────────────────────────────────────
const INSIGHT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LEDGER_ENTRY_THRESHOLD = 20;            // trigger refresh after 20 new entries

// Track in-flight refreshes per store to prevent duplicates
const refreshInFlight = new Set();

// ── Worker dispatch ────────────────────────────────────────────────────────────

function dispatchWorker(workerFile, workerData) {
    const worker = new Worker(path.join(__dirname, '../workers', workerFile), { workerData });
    worker.on('error', (e) => console.error(`[AI] Worker ${workerFile} error:`, e));
    return worker;
}

// ── OCR job helpers (kept for bills flow) ─────────────────────────────────────

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

// ── AI Insights Cache ─────────────────────────────────────────────────────────

/**
 * Returns cached insights from ai_insights table for a store.
 * Returns an object: { forecast, inventory, festival, generatedAt }
 */
async function getInsights(userId, storeId) {
    const { rows } = await pool.query(
        `SELECT type, data, generated_at FROM ai_insights
         WHERE store_id=$1
         ORDER BY generated_at DESC`,
        [storeId]
    );

    const result = {
        forecast: null,
        inventory: null,
        festival: [],
        generatedAt: null,
    };

    for (const row of rows) {
        result[row.type] = row.data;
        // Use the oldest generatedAt to show the "least fresh" time
        if (!result.generatedAt || row.generated_at < result.generatedAt) {
            result.generatedAt = row.generated_at;
        }
    }

    return result;
}

/**
 * Dispatches the refreshInsights worker for a store.
 * Skips if a refresh is already running for this store.
 */
function triggerInsightsRefresh(userId, storeId, storeType) {
    if (refreshInFlight.has(storeId)) {
        console.log(`[AI] Refresh already in progress for store ${storeId}, skipping`);
        return;
    }
    refreshInFlight.add(storeId);
    const worker = dispatchWorker('refreshInsights.js', {
        userId,
        storeId,
        storeType: storeType || 'general',
    });
    worker.on('message', () => refreshInFlight.delete(storeId));
    worker.on('error', () => refreshInFlight.delete(storeId));
    worker.on('exit', () => refreshInFlight.delete(storeId));
    console.log(`[AI] Refresh triggered for store ${storeId}`);
}

/**
 * Checks whether insights need refreshing (older than 24h or 20+ new ledger entries)
 * and triggers a background refresh if so.
 */
async function checkAndRefreshIfNeeded(userId, storeId, storeType) {
    try {
        // Get existing insights meta
        const { rows } = await pool.query(
            `SELECT type, generated_at, ledger_count_at_generation
             FROM ai_insights WHERE store_id=$1`,
            [storeId]
        );

        // If no insights at all — trigger immediately
        if (!rows.length) {
            triggerInsightsRefresh(userId, storeId, storeType);
            return;
        }

        // Check if insights haven't been refreshed today (UTC calendar day)
        const oldest = rows.reduce((a, b) => a.generated_at < b.generated_at ? a : b);
        const genDateStr = new Date(oldest.generated_at).toISOString().slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);
        if (genDateStr < todayStr) {
            console.log(`[AI] Insights for store ${storeId} not refreshed today (last: ${genDateStr}). Refreshing.`);
            triggerInsightsRefresh(userId, storeId, storeType);
            return;
        }

        // Check if 20+ new ledger entries since last generation
        const ledgerCountAtGen = oldest.ledger_count_at_generation || 0;
        const { rows: [{ count }] } = await pool.query(
            'SELECT COUNT(*)::int AS count FROM ledger_entries WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)',
            [userId, storeId]
        );
        const currentCount = count || 0;
        if (currentCount - ledgerCountAtGen >= LEDGER_ENTRY_THRESHOLD) {
            console.log(`[AI] ${currentCount - ledgerCountAtGen} new ledger entries since last generation. Refreshing.`);
            triggerInsightsRefresh(userId, storeId, storeType);
        }
    } catch (e) {
        console.error('[AI] checkAndRefreshIfNeeded error:', e.message);
    }
}

/**
 * Scheduler: refresh insights for all active stores periodically.
 * Called once at server startup.
 */
async function startInsightsScheduler() {
    const doRefresh = async () => {
        try {
            // Get all stores with at least 1 ledger entry (active stores)
            const { rows: activeStores } = await pool.query(
                `SELECT DISTINCT s.id AS store_id, s.user_id, s.type AS store_type
                 FROM stores s
                 JOIN ledger_entries le ON le.store_id = s.id
                 LIMIT 50`
            );
            console.log(`[AI Scheduler] Refreshing insights for ${activeStores.length} active store(s)`);
            for (const store of activeStores) {
                triggerInsightsRefresh(store.user_id, store.store_id, store.store_type);
                // Stagger workers by 10s to avoid simultaneous Gemini calls
                await new Promise(r => setTimeout(r, 10_000));
            }
        } catch (e) {
            console.error('[AI Scheduler] Error:', e.message);
        }
    };

    // Run at 06:00, 14:00, 22:00 UTC — 3 times per day, evenly spaced 8h apart.
    // This is the ONLY place AI workers are triggered by time. The app never starts AI.
    const SCHEDULE_HOURS_UTC = [6, 14, 22];

    const msToNextRun = () => {
        const now = new Date();
        const candidates = SCHEDULE_HOURS_UTC.map(h => {
            const t = new Date(now);
            t.setUTCHours(h, 0, 0, 0);
            if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
            return t;
        });
        const next = candidates.reduce((a, b) => (a < b ? a : b));
        return next - now;
    };

    const scheduleNext = () => {
        const delay = msToNextRun();
        const hrs = (delay / 3_600_000).toFixed(1);
        const nextTime = new Date(Date.now() + delay).toISOString().slice(11, 16);
        console.log(`[AI Scheduler] Next run in ${hrs}h (at ${nextTime} UTC)`);
        setTimeout(async () => { await doRefresh(); scheduleNext(); }, delay);
    };

    scheduleNext();
    console.log('[AI Scheduler] Started — insights refresh 3× daily at 06:00, 14:00, 22:00 UTC');
}

module.exports = {
    // OCR/bills jobs
    createJob, getJob, getJobResult,
    // Insights cache
    getInsights, triggerInsightsRefresh, checkAndRefreshIfNeeded, startInsightsScheduler,
};
