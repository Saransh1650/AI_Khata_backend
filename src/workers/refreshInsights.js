'use strict';
/**
 * refreshInsights worker — Context-Aware Shop Guidance
 * ─────────────────────────────────────────────────────
 * Gathers real inventory, recent sales trends, shop activity, and the closest
 * upcoming festival from the DB, then sends a single structured prompt to
 * Gemini. The AI returns "guidance cards" (stock_check, pattern,
 * event_context, info) that the app renders directly.
 *
 * RULES:
 *  • Database is truth — only reason from actual shop data.
 *  • No numerical predictions (no sales numbers, percentages, revenue).
 *  • Qualitative reasoning only — practical, shopkeeper-friendly advice.
 *
 * workerData: { storeId, userId, storeType, overrideOccasion? }
 */
const { workerData, parentPort } = require('worker_threads');
const pool = require('../config/database');
const { generateExperienceGuidance } = require('../ai/experienceEngine');
const { learnFromTransaction } = require('../ai/shopMemory');
const { discoverProductRelationships } = require('../ai/relationshipIntelligence');

const { storeId, userId, storeType = 'general', overrideOccasion = null } = workerData;

// ── Data Gathering ──────────────────────────────────────────────────────────

async function getInventory() {
    const { rows } = await pool.query(
        `SELECT product_name AS product, quantity, unit
         FROM stock_items
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
         ORDER BY product_name`,
        [userId, storeId]
    );
    return rows.map(r => ({
        product: r.product,
        quantity: Number(r.quantity),
        unit: r.unit || 'units',
    }));
}

async function getRecentSales() {
    const { rows } = await pool.query(
        `SELECT
           li.product_name AS product,
           SUM(CASE WHEN le.transaction_date >= NOW() - INTERVAL '14 days'
                    THEN li.quantity ELSE 0 END)::float AS recent_qty,
           SUM(CASE WHEN le.transaction_date < NOW() - INTERVAL '14 days'
                     AND le.transaction_date >= NOW() - INTERVAL '28 days'
                    THEN li.quantity ELSE 0 END)::float AS prior_qty
         FROM line_items li
         JOIN ledger_entries le ON le.id = li.ledger_entry_id
         WHERE le.user_id=$1 AND ($2::uuid IS NULL OR le.store_id=$2)
           AND le.transaction_date >= NOW() - INTERVAL '28 days'
         GROUP BY li.product_name
         ORDER BY recent_qty DESC
         LIMIT 20`,
        [userId, storeId]
    );

    return rows.map(r => {
        let trend = 'stable';
        if (r.prior_qty > 0) {
            if (r.recent_qty > r.prior_qty * 1.2) trend = 'rising';
            else if (r.recent_qty < r.prior_qty * 0.8) trend = 'slowing';
        } else if (r.recent_qty > 0) {
            trend = 'new';
        }
        return { product: r.product, trend };
    });
}

async function getShopActivity() {
    const { rows: [activity] } = await pool.query(
        `SELECT
           SUM(CASE WHEN transaction_date >= NOW() - INTERVAL '7 days'
                    THEN 1 ELSE 0 END)::int AS this_week,
           SUM(CASE WHEN transaction_date < NOW() - INTERVAL '7 days'
                     AND transaction_date >= NOW() - INTERVAL '14 days'
                    THEN 1 ELSE 0 END)::int AS last_week
         FROM ledger_entries
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
           AND transaction_date >= NOW() - INTERVAL '14 days'`,
        [userId, storeId]
    );

    let recentBusiness = 'steady';
    const tw = activity?.this_week || 0;
    const lw = activity?.last_week || 0;
    if (lw > 0) {
        if (tw > lw * 1.2) recentBusiness = 'growing';
        else if (tw < lw * 0.8) recentBusiness = 'slowing';
    } else if (tw > 0) {
        recentBusiness = 'starting';
    } else {
        recentBusiness = 'quiet';
    }

    const { rows: busyRows } = await pool.query(
        `SELECT
           TRIM(TO_CHAR(transaction_date, 'Day')) AS day_name,
           COUNT(*)::int AS cnt
         FROM ledger_entries
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
           AND transaction_date >= NOW() - INTERVAL '30 days'
         GROUP BY day_name
         ORDER BY cnt DESC
         LIMIT 3`,
        [userId, storeId]
    );

    return { recentBusiness, busyDays: busyRows.map(r => r.day_name) };
}

// ── Upsert ──────────────────────────────────────────────────────────────────

async function upsertInsight(type, data, ledgerCount) {
    if (data === null || data === undefined) return;

    const serialised = JSON.stringify(data);
    const isUseless = serialised === '{}' || serialised === '[]'
        || (typeof data === 'object' && !Array.isArray(data) && data.error);

    if (isUseless) {
        console.log(`[refreshInsights] Skipping ${type} upsert — empty/error, preserving cache.`);
        return;
    }

    await pool.query(
        `INSERT INTO ai_insights(store_id, type, data, generated_at, ledger_count_at_generation)
         VALUES($1,$2,$3,NOW(),$4)
         ON CONFLICT(store_id, type)
         DO UPDATE SET data=$3, generated_at=NOW(), ledger_count_at_generation=$4`,
        [storeId, type, serialised, ledgerCount]
    );
    console.log(`[refreshInsights] Upserted ${type} for store ${storeId}`);
}

// ── Memory Learning ─────────────────────────────────────────────────────────

/**
 * Learn from recent transactions to update shop memory
 */
async function updateShopMemory() {
    try {
        // Get recent transactions that haven't been learned from yet
        const { rows } = await pool.query(
            `SELECT le.id, le.transaction_date, le.merchant, le.total_amount,
                    json_agg(json_build_object(
                        'product_name', li.product_name,
                        'quantity', li.quantity,
                        'total_price', li.total_price
                    )) as line_items
             FROM ledger_entries le
             JOIN line_items li ON le.id = li.ledger_entry_id
             WHERE le.user_id = $1 AND ($2::uuid IS NULL OR le.store_id = $2)
               AND le.transaction_date >= NOW() - INTERVAL '7 days'
             GROUP BY le.id, le.transaction_date, le.merchant, le.total_amount
             ORDER BY le.transaction_date DESC
             LIMIT 50`,
            [userId, storeId]
        );
        
        for (const transaction of rows) {
            await learnFromTransaction(userId, storeId, {
                line_items: transaction.line_items,
                transaction_date: transaction.transaction_date,
                merchant: transaction.merchant,
                total_amount: transaction.total_amount
            });
        }
        
        console.log(`[refreshInsights] Learned from ${rows.length} recent transactions`);
    } catch (error) {
        console.error('[refreshInsights] Memory learning error:', error.message);
    }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
    console.log(`[refreshInsights] Starting for store ${storeId} (${storeType})`);
    try {
        const { rows: [{ count }] } = await pool.query(
            'SELECT COUNT(*)::int AS count FROM ledger_entries WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)',
            [userId, storeId]
        );
        const ledgerCount = count || 0;
        
        // Update shop memory from recent transactions (always)
        await updateShopMemory();

        // Gather shop data from DB
        const [inventory, recentSales, shopActivity] = await Promise.all([
            getInventory(),
            getRecentSales(),
            getShopActivity(),
        ]);
        // Festival is always user-provided via the app's occasion picker (no calendar auto-detection)
        const upcomingFestival = overrideOccasion ?? null;
        if (upcomingFestival) {
            console.log(`[refreshInsights] Festival occasion provided: ${upcomingFestival.name} (${upcomingFestival.daysAway} days away)`);
        }

        const input = {
            storeType,
            todayDate: new Date().toISOString().slice(0, 10),
            inventory,
            recentSales,
            shopActivity,
            upcomingFestival,
        };

        // No data at all → store a helpful fallback, skip AI call
        if (!inventory.length && !recentSales.length) {
            const fallback = {
                mode: 'NORMAL',
                guidance: [{
                    type: 'info',
                    insight: 'Keep adding bills. Guidance improves as your shop data grows.',
                }],
            };
            await upsertInsight('guidance', fallback, ledgerCount);
            console.log('[refreshInsights] No data — stored fallback guidance');
        } else {
            let guidance;

            // Always use RAG-driven experience guidance
            console.log('[refreshInsights] Using RAG-driven experience guidance');
            try {
                guidance = await generateExperienceGuidance(storeId, storeType, input);

                // Discover and update product relationships
                try {
                    await discoverProductRelationships(storeId, 90);
                } catch (err) {
                    console.error('[refreshInsights] Relationship discovery failed:', err.message);
                }
            } catch (error) {
                console.error('[refreshInsights] RAG guidance failed:', error.message);
                guidance = {
                    mode: 'EXPERIENCE_NORMAL',
                    philosophy: 'experience_driven',
                    guidance: [{
                        type: 'info',
                        insight: 'Could not generate advice right now. Keep adding bills.',
                    }],
                };
            }
            
            await upsertInsight('guidance', guidance, ledgerCount);
        }

        // Clean up legacy insight types from old system
        await pool.query(
            `DELETE FROM ai_insights WHERE store_id=$1 AND type IN ('forecast', 'festival', 'inventory')`,
            [storeId]
        ).catch(() => { /* ignore if rows don't exist */ });

        console.log(`[refreshInsights] Done for store ${storeId}`);
    } catch (e) {
        console.error('[refreshInsights] Worker error:', e.message);
    } finally {
        await pool.end();
        if (parentPort) parentPort.postMessage('done');
    }
}

run();
