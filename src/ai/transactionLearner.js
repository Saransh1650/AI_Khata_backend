'use strict';
/**
 * Transaction Memory Learner — Automated RAG Learning
 * ────────────────────────────────────────────────────
 * 
 * This service automatically learns from new transactions as they are added
 * to build up the shop's RAG memory over time.
 * 
 * It's triggered when:
 * - New ledger entries are created
 * - Bills are processed and line items added
 * - Periodic background learning runs
 */
const pool = require('../config/database');
const { learnFromTransaction, generateExperienceInsights } = require('./shopMemory');
const { discoverProductRelationships } = require('./relationshipIntelligence');

// ── Automated Learning Triggers ────────────────────────────────────────────

/**
 * Learn from a newly created transaction
 */
async function learnFromNewTransaction(ledgerEntryId) {
    try {
        // Get the transaction with its line items
        const { rows } = await pool.query(`
            SELECT 
                le.user_id, le.store_id, le.transaction_date, 
                le.merchant, le.total_amount,
                json_agg(json_build_object(
                    'product_name', li.product_name,
                    'quantity', li.quantity,
                    'total_price', li.total_price,
                    'unit_price', li.unit_price
                )) as line_items
            FROM ledger_entries le
            LEFT JOIN line_items li ON le.id = li.ledger_entry_id
            WHERE le.id = $1
            GROUP BY le.id, le.user_id, le.store_id, le.transaction_date, le.merchant, le.total_amount
        `, [ledgerEntryId]);
        
        if (rows.length === 0) {
            console.log(`[TransactionLearner] No transaction found for ID: ${ledgerEntryId}`);
            return;
        }
        
        const transaction = rows[0];
        if (!transaction.line_items || transaction.line_items[0].product_name === null) {
            console.log(`[TransactionLearner] No line items for transaction: ${ledgerEntryId}`);
            return;
        }
        
        // Learn from this transaction
        await learnFromTransaction(transaction.user_id, transaction.store_id, {
            line_items: transaction.line_items,
            transaction_date: transaction.transaction_date,
            merchant: transaction.merchant,
            total_amount: transaction.total_amount
        });
        
        console.log(`[TransactionLearner] Learned from transaction ${ledgerEntryId} for store ${transaction.store_id}`);
        
        // Check if we should trigger deeper learning
        await checkTriggerDeepLearning(transaction.store_id, transaction.user_id);
        
    } catch (error) {
        console.error('[TransactionLearner] Learning error:', error);
    }
}

/**
 * Check if we should trigger deeper relationship discovery
 */
async function checkTriggerDeepLearning(storeId, userId) {
    try {
        // Get total transactions for this store
        const { rows: [{ count }] } = await pool.query(
            'SELECT COUNT(*)::int AS count FROM ledger_entries WHERE user_id = $1 AND store_id = $2',
            [userId, storeId]
        );
        
        const transactionCount = count || 0;
        
        // Trigger deeper learning at specific milestones
        if (shouldTriggerDeepLearning(transactionCount)) {
            console.log(`[TransactionLearner] Triggering deep learning at ${transactionCount} transactions`);
            
            // Run relationship discovery in background
            setImmediate(async () => {
                try {
                    await discoverProductRelationships(storeId, 90);
                    await generateExperienceInsights(storeId);
                    console.log(`[TransactionLearner] Deep learning completed for store ${storeId}`);
                } catch (error) {
                    console.error('[TransactionLearner] Deep learning failed:', error);
                }
            });
        }
        
    } catch (error) {
        console.error('[TransactionLearner] Deep learning check failed:', error);
    }
}

/**
 * Define milestones for triggering deeper learning
 */
function shouldTriggerDeepLearning(transactionCount) {
    const milestones = [20, 50, 100, 200, 500];
    return milestones.includes(transactionCount);
}

/**
 * Initialize store memory from all historical transactions within lookback window
 */
async function initializeStoreMemory(userId, storeId, lookbackDays = 90) {
    const { rows: transactions } = await pool.query(
        `SELECT le.id FROM ledger_entries le
         WHERE le.user_id = $1 AND le.store_id = $2
           AND le.transaction_date >= NOW() - ($3 || ' days')::INTERVAL
         ORDER BY le.transaction_date ASC`,
        [userId, storeId, parseInt(lookbackDays)]
    );

    let learned = 0;
    for (const { id } of transactions) {
        try { await learnFromNewTransaction(id); learned++; }
        catch (e) { console.error(`[TransactionLearner] Init skipped ${id}: ${e.message}`); }
    }

    try {
        await discoverProductRelationships(storeId, lookbackDays);
        await generateExperienceInsights(storeId);
    } catch (e) {
        console.error('[TransactionLearner] Post-init deep learning failed:', e.message);
    }

    return { transactionsProcessed: learned, total: transactions.length, lookbackDays };
}

/**
 * Return a health summary of the shop's RAG memory
 */
async function checkMemoryHealth(storeId) {
    const [memRes, relRes, insRes] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS count, COALESCE(AVG(confidence), 0)::float AS avg_conf
             FROM shop_memory WHERE store_id = $1`,
            [storeId]
        ),
        pool.query(
            `SELECT COUNT(*)::int AS count, COALESCE(AVG(strength), 0)::float AS avg_strength
             FROM product_relationships WHERE store_id = $1`,
            [storeId]
        ),
        pool.query(
            `SELECT COUNT(*)::int AS count FROM experience_insights WHERE store_id = $1`,
            [storeId]
        ),
    ]);

    const productCount  = memRes.rows[0].count;
    const avgConf       = memRes.rows[0].avg_conf;
    const relCount      = relRes.rows[0].count;
    const avgStrength   = relRes.rows[0].avg_strength;
    const insightCount  = insRes.rows[0].count;

    let score = 0;
    score += Math.min(40, (productCount / 10) * 40);
    score += Math.min(30, (avgConf / 0.6) * 30);
    score += Math.min(20, (relCount  / 5)  * 20);
    if (insightCount >= 1) score += 10;
    score = Math.min(100, Math.round(score));

    return {
        productMemoryCount:       productCount,
        avgConfidence:            Math.round(avgConf * 100) / 100,
        relationshipsCount:       relCount,
        avgRelationshipStrength:  Math.round(avgStrength * 100) / 100,
        insightCount,
        healthScore: score,
        status: score >= 70 ? 'good' : score >= 40 ? 'growing' : 'initializing',
    };
}

/**
 * Remove weak/stale memory entries
 */
async function cleanupMemory(storeId, maxAgeDays = 180, minConfidence = 0.20) {
    const [memDel, relDel] = await Promise.all([
        pool.query(
            `DELETE FROM shop_memory
             WHERE store_id = $1 AND confidence < $2
             RETURNING id`,
            [storeId, minConfidence]
        ),
        pool.query(
            `DELETE FROM product_relationships
             WHERE store_id = $1 AND strength < $2
             RETURNING id`,
            [storeId, minConfidence]
        ),
    ]);
    return {
        productMemoryRemoved:  memDel.rowCount,
        relationshipsRemoved:  relDel.rowCount,
        parameters: { maxAgeDays, minConfidence },
    };
}

/**
 * Learn from all transactions within the last N days, then run deep analysis
 */
async function batchLearnFromRecentTransactions(userId, storeId, days = 30) {
    const { rows: transactions } = await pool.query(
        `SELECT le.id FROM ledger_entries le
         WHERE le.user_id = $1 AND le.store_id = $2
           AND le.transaction_date >= NOW() - ($3 || ' days')::INTERVAL
         ORDER BY le.transaction_date ASC`,
        [userId, storeId, parseInt(days)]
    );

    let learned = 0;
    for (const { id } of transactions) {
        try { await learnFromNewTransaction(id); learned++; }
        catch (e) { console.error(`[TransactionLearner] Batch skip ${id}: ${e.message}`); }
    }

    if (learned > 0) {
        try {
            await discoverProductRelationships(storeId, days);
            await generateExperienceInsights(storeId);
        } catch (e) {
            console.error('[TransactionLearner] Post-batch deep learning failed:', e.message);
        }
    }

    return learned;
}

module.exports = {
    learnFromNewTransaction,
    initializeStoreMemory,
    checkMemoryHealth,
    cleanupMemory,
    batchLearnFromRecentTransactions,
};