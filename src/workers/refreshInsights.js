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
 * workerData: { storeId, userId, storeType }
 */
const { workerData, parentPort } = require('worker_threads');
const pool = require('../config/database');
const { callGemini } = require('../config/gemini');
const { getUpcomingFestivals } = require('../ai/festivalCalendar');
const { generateExperienceGuidance } = require('../ai/experienceEngine');
const { learnFromTransaction } = require('../ai/shopMemory');
const { discoverProductRelationships } = require('../ai/relationshipIntelligence');

const { storeId, userId, storeType = 'general' } = workerData;

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

function getClosestFestival() {
    const festivals = getUpcomingFestivals(45, storeType);
    if (!festivals.length) return null;
    const closest = festivals.reduce((a, b) => (a.date < b.date ? a : b));
    const daysAway = Math.ceil((closest.date - new Date()) / 86400000);
    return { name: closest.name, daysAway };
}

// ── Prompt & AI Call ────────────────────────────────────────────────────────

async function generateGuidance(input) {
    const isEvent = input.upcomingFestival && input.upcomingFestival.daysAway <= 10;

    const prompt = `You are a shop advisor for a ${input.storeType} retail shop in India.
Today is ${input.todayDate}.

CORE RULES:
1. Database is truth — only reason from the data provided below.
2. No numerical predictions — no sales numbers, percentages, forecasts, or revenue estimates.
3. Think like a shopkeeper's trusted advisor — practical, short, helpful.
4. Qualitative reasoning only. Say "demand is picking up" not "demand increased 23%".

INPUT DATA:
${JSON.stringify(input, null, 2)}

REASONING STEPS (follow in order, do NOT output these — only use them internally):
1. Stock Readiness — classify each inventory item: GOOD / WATCH / LOW based on recent sales pace.
2. Pattern Understanding — items gaining momentum, slowing, or newly appearing.
${isEvent ? `3. **FESTIVAL DEMAND ANALYSIS** (CRITICAL — ${input.upcomingFestival.name} is ${input.upcomingFestival.daysAway} day(s) away):
   a) Identify EVERY item in inventory whose demand will spike because of ${input.upcomingFestival.name}.
      Think about what customers actually buy before and during this festival.
      Examples for Holi: milk, sugar, ghee, maida, colours/gulaal, sweets, dry fruits, cold drinks, snacks, namkeen, paneer.
      Examples for Diwali: sugar, ghee, dry fruits, maida, diyas, candles, sweets, pooja items.
      Adapt to the specific festival and the shop's actual inventory.
   b) For each festival-relevant item, assess urgency:
      - "critical": Item WILL stock out — current stock is low AND demand will be very high. Owner must order TODAY.
      - "high": Current stock may not last through the festival rush. Stock 2-3x normal quantity.
      - "moderate": Demand will increase noticeably. Stock a bit extra.
   c) Also flag any items NOT currently in inventory that customers WILL ask for (classification: "opportunity").
   d) IMPORTANT: If an item is normally GOOD in stock_check but will face a demand surge during the festival,
      it MUST appear in event_context with the right urgency — do NOT just list it as "GOOD" in stock_check and ignore the surge.
4. Adjust stock_check: When in EVENT mode, stock statuses should FACTOR IN the festival demand.
   An item with "okay" stock normally should become WATCH or LOW if festival demand will drain it.
5. Produce UI Guidance Cards.` : `3. Festival Context — skip if no upcoming festival within 10 days.
4. Produce UI Guidance Cards.`}

OUTPUT FORMAT (STRICT JSON — return ONLY this object, nothing else):
{
  "mode": "${isEvent ? 'EVENT' : 'NORMAL'}",
  "guidance": [
    {
      "type": "stock_check",
      "items": [
        { "product": "name", "status": "GOOD", "reason": "short reason", "action": "what to do" }
      ]
    },
    {
      "type": "pattern",
      "insight": "short observation about a trend",
      "action": "what to do about it"
    }${isEvent ? `,
    {
      "type": "event_context",
      "event": "${input.upcomingFestival.name}",
      "summary": "one-line festival prep message",
      "items": [
        {
          "product": "name",
          "urgency": "critical",
          "demand_note": "Why demand surges and how much extra to stock (e.g. 'Stock 3x usual — Holi sweets prep')",
          "classification": "existing_product",
          "action": "Order extra today"
        }
      ]
    }` : `,
    {
      "type": "event_context",
      "event": "festival name",
      "items": [
        { "product": "name", "classification": "existing_product", "action": "what to do" }
      ]
    }`},
    {
      "type": "info",
      "insight": "helpful general message"
    }
  ]
}

CARD RULES:
- "mode": Set to "EVENT" ONLY when upcomingFestival exists and daysAway <= 10. Otherwise "NORMAL".
- "stock_check": Always include if inventory data exists. Max 8 items. Status: GOOD / WATCH / LOW.${isEvent ? `
  In EVENT mode: factor in festival demand when deciding status. If milk normally is GOOD but Holi is tomorrow, mark it WATCH or LOW.` : ''}
- "pattern": Include 1-2 cards if recent sales show notable trends. Skip if no clear pattern.
- "event_context": Include ONLY when mode is "EVENT".${isEvent ? `
  FESTIVAL ITEMS RULES:
  - Go through ALL inventory items and flag every one that is festival-relevant for ${input.upcomingFestival.name}.
  - "urgency": "critical" (will stock out, order TODAY) / "high" (stock 2-3x usual) / "moderate" (stock extra).
  - "demand_note": REQUIRED — explain WHY demand spikes and suggest stocking level (e.g. "Holi sweets need lots of milk — stock 3x usual").
  - "classification": "existing_product" if in inventory, "opportunity" if not.
  - Put critical items first, then high, then moderate.
  - "summary": one-line like "Holi is tomorrow — here's what will fly off the shelves"
  - This card should be comprehensive — miss nothing that customers will ask for.` : ''}
- "info": Include when data is thin, or as a practical general tip at the end.
- Tone: Short sentences. Shopkeeper-friendly. No analytics jargon. Hindi-English mix OK.
- ONLY return the JSON object. No markdown, no code fences, no explanation.`;

    return callGemini(prompt);
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
        
        // Update shop memory from recent transactions
        if (ledgerCount >= 5) {
            await updateShopMemory();
        }

        // Gather shop data from DB
        const [inventory, recentSales, shopActivity] = await Promise.all([
            getInventory(),
            getRecentSales(),
            getShopActivity(),
        ]);
        const upcomingFestival = getClosestFestival();

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
            
            // Try RAG-driven experience guidance first (if enough data)
            if (ledgerCount >= 10) {
                console.log('[refreshInsights] Using RAG-driven experience guidance');
                try {
                    guidance = await generateExperienceGuidance(storeId, storeType, input);
                    
                    // Discover and update product relationships in background
                    if (ledgerCount >= 20) {
                        discoverProductRelationships(storeId, 90).catch(err => {
                            console.error('[refreshInsights] Relationship discovery failed:', err.message);
                        });
                    }
                } catch (error) {
                    console.error('[refreshInsights] RAG guidance failed, falling back to traditional:', error.message);
                    guidance = null;
                }
            }
            
            // Fallback to traditional AI guidance if RAG fails or insufficient data
            if (!guidance) {
                console.log('[refreshInsights] Using traditional AI guidance');
                const result = await generateGuidance(input);
                guidance = (result && result.mode && Array.isArray(result.guidance))
                    ? result
                    : {
                        mode: 'NORMAL',
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
