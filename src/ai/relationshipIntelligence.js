'use strict';
/**
 * Product Relationship Intelligence — The Core of RAG Sales Intelligence
 * ─────────────────────────────────────────────────────────────────────
 * 
 * This is the MOST IMPORTANT component of AI Khata's RAG system.
 * It identifies relationships between products to enable "Sales Expansion Guidance":
 * 
 * Instead of: "Restock snacks"
 * Suggest: "Restock snacks + cold drinks (customers buy them together)"
 * 
 * This moves from inventory management to revenue optimization.
 */
const pool = require('../config/database');
const { getProductExperience } = require('./shopMemory');

// ── Relationship Types & Their Business Logic ──────────────────────────────

const RELATIONSHIP_TYPES = {
    FREQUENTLY_TOGETHER: 'frequently_together',    // High co-purchase rate
    SEQUENTIAL: 'sequential',                      // B bought after A temporally  
    COMPLEMENTARY: 'complementary',               // One triggers demand for other
    SEASONAL_PAIR: 'seasonal_pair',               // Bought together during events
    SUBSTITUTE: 'substitute'                      // Either A or B, rarely both
};

// ── Core Relationship Discovery ────────────────────────────────────────────

/**
 * Analyze transaction patterns to discover product relationships
 */
async function discoverProductRelationships(storeId, lookbackDays = 90) {
    console.log(`[RelationshipIntelligence] Analyzing ${lookbackDays} days of transactions for store ${storeId}`);
    
    const relationships = await Promise.all([
        discoverFrequentPairs(storeId, lookbackDays),
        discoverSequentialPatterns(storeId, lookbackDays),
        discoverComplementaryItems(storeId, lookbackDays),
        discoverSeasonalPairs(storeId, lookbackDays)
    ]);
    
    // Flatten and deduplicate relationships
    const allRelationships = relationships.flat();
    const uniqueRelationships = deduplicateRelationships(allRelationships);
    
    // Store discovered relationships
    for (const relationship of uniqueRelationships) {
        await storeRelationship(storeId, relationship);
    }
    
    console.log(`[RelationshipIntelligence] Discovered ${uniqueRelationships.length} unique relationships`);
    return uniqueRelationships;
}

/**
 * Find products frequently bought together in same transaction
 */
async function discoverFrequentPairs(storeId, lookbackDays) {
    const query = `
        WITH transaction_products AS (
            SELECT 
                le.id as transaction_id,
                li.product_name,
                le.transaction_date,
                EXTRACT(MONTH FROM le.transaction_date) as month
            FROM ledger_entries le
            JOIN line_items li ON le.id = li.ledger_entry_id
            WHERE le.store_id = $1 
                AND le.transaction_date >= NOW() - INTERVAL '${lookbackDays} days'
        ),
        product_pairs AS (
            SELECT 
                t1.product_name as product_a,
                t2.product_name as product_b,
                t1.month,
                COUNT(*) as co_occurrences,
                COUNT(DISTINCT t1.transaction_id) as transaction_count
            FROM transaction_products t1
            JOIN transaction_products t2 ON t1.transaction_id = t2.transaction_id
            WHERE t1.product_name < t2.product_name  -- Avoid duplicates
            GROUP BY t1.product_name, t2.product_name, t1.month
            HAVING COUNT(*) >= 3  -- Minimum co-occurrences
        ),
        total_transactions AS (
            SELECT COUNT(DISTINCT transaction_id) as total FROM transaction_products
        )
        SELECT 
            product_a,
            product_b,
            month,
            co_occurrences,
            transaction_count,
            ROUND(transaction_count::decimal / (SELECT total FROM total_transactions), 3) as support
        FROM product_pairs
        WHERE transaction_count >= 3
        ORDER BY co_occurrences DESC, support DESC
        LIMIT 50
    `;
    
    const { rows } = await pool.query(query, [storeId]);
    
    return rows.map(row => ({
        productA: row.product_a,
        productB: row.product_b,
        type: RELATIONSHIP_TYPES.FREQUENTLY_TOGETHER,
        strength: Math.min(row.support * 2, 0.95), // Support-based strength
        evidence: {
            coOccurrences: row.co_occurrences,
            transactionCount: row.transaction_count,
            support: row.support
        },
        context: getMonthName(row.month),
        businessReason: 'Customers frequently buy these together'
    }));
}

/**
 * Find sequential purchase patterns (A often leads to B)
 */
async function discoverSequentialPatterns(storeId, lookbackDays) {
    const query = `
        WITH customer_purchases AS (
            SELECT 
                le.merchant,  -- Using merchant as customer proxy
                li.product_name,
                le.transaction_date,
                ROW_NUMBER() OVER (
                    PARTITION BY le.merchant 
                    ORDER BY le.transaction_date
                ) as purchase_sequence
            FROM ledger_entries le
            JOIN line_items li ON le.id = li.ledger_entry_id
            WHERE le.store_id = $1 
                AND le.transaction_date >= NOW() - INTERVAL '${lookbackDays} days'
                AND le.merchant IS NOT NULL
        ),
        sequential_pairs AS (
            SELECT 
                p1.product_name as product_a,
                p2.product_name as product_b,
                COUNT(*) as sequence_count,
                AVG(EXTRACT(DAYS FROM p2.transaction_date - p1.transaction_date)) as avg_days_between
            FROM customer_purchases p1
            JOIN customer_purchases p2 ON p1.merchant = p2.merchant
            WHERE p2.purchase_sequence = p1.purchase_sequence + 1
                AND p1.product_name != p2.product_name
                AND p2.transaction_date - p1.transaction_date <= INTERVAL '7 days'
            GROUP BY p1.product_name, p2.product_name
            HAVING COUNT(*) >= 2
        )
        SELECT * FROM sequential_pairs
        ORDER BY sequence_count DESC
        LIMIT 20
    `;
    
    const { rows } = await pool.query(query, [storeId]);
    
    return rows.map(row => ({
        productA: row.product_a,
        productB: row.product_b,
        type: RELATIONSHIP_TYPES.SEQUENTIAL,
        strength: Math.min(row.sequence_count / 5, 0.85),
        evidence: {
            sequenceCount: row.sequence_count,
            avgDaysBetween: Math.round(row.avg_days_between)
        },
        businessReason: `${row.product_b} often purchased after ${row.product_a}`
    }));
}

/**
 * Find complementary products (high individual sales, higher together)
 */
async function discoverComplementaryItems(storeId, lookbackDays) {
    const query = `
        WITH product_sales AS (
            SELECT 
                li.product_name,
                COUNT(*) as individual_sales,
                AVG(li.quantity) as avg_quantity
            FROM ledger_entries le
            JOIN line_items li ON le.id = li.ledger_entry_id
            WHERE le.store_id = $1 
                AND le.transaction_date >= NOW() - INTERVAL '${lookbackDays} days'
            GROUP BY li.product_name
            HAVING COUNT(*) >= 5  -- Products with decent individual sales
        ),
        basket_analysis AS (
            SELECT 
                t1.product_name as product_a,
                t2.product_name as product_b,
                COUNT(*) as together_sales,
                ps1.individual_sales as a_individual,
                ps2.individual_sales as b_individual
            FROM ledger_entries le
            JOIN line_items t1 ON le.id = t1.ledger_entry_id
            JOIN line_items t2 ON le.id = t2.ledger_entry_id
            JOIN product_sales ps1 ON t1.product_name = ps1.product_name
            JOIN product_sales ps2 ON t2.product_name = ps2.product_name
            WHERE le.store_id = $1
                AND le.transaction_date >= NOW() - INTERVAL '${lookbackDays} days'
                AND t1.product_name < t2.product_name
            GROUP BY t1.product_name, t2.product_name, ps1.individual_sales, ps2.individual_sales
            HAVING COUNT(*) >= 3
        )
        SELECT 
            product_a,
            product_b,
            together_sales,
            a_individual,
            b_individual,
            ROUND(together_sales::decimal / LEAST(a_individual, b_individual), 3) as lift_ratio
        FROM basket_analysis
        WHERE together_sales::decimal / LEAST(a_individual, b_individual) > 0.3
        ORDER BY lift_ratio DESC
        LIMIT 15
    `;
    
    const { rows } = await pool.query(query, [storeId]);
    
    return rows.map(row => ({
        productA: row.product_a,
        productB: row.product_b,
        type: RELATIONSHIP_TYPES.COMPLEMENTARY,
        strength: Math.min(row.lift_ratio, 0.90),
        evidence: {
            togetherSales: row.together_sales,
            productAIndividual: row.a_individual,
            productBIndividual: row.b_individual,
            liftRatio: row.lift_ratio
        },
        businessReason: `${row.product_a} and ${row.product_b} amplify each other's sales`
    }));
}

/**
 * Find seasonal/festival-specific product pairs
 */
async function discoverSeasonalPairs(storeId, lookbackDays) {
    const query = `
        WITH seasonal_transactions AS (
            SELECT 
                li.product_name,
                EXTRACT(MONTH FROM le.transaction_date) as month,
                CASE 
                    WHEN EXTRACT(MONTH FROM le.transaction_date) IN (10, 11) THEN 'Diwali_Season'
                    WHEN EXTRACT(MONTH FROM le.transaction_date) IN (3, 4) THEN 'Holi_Season'
                    WHEN EXTRACT(MONTH FROM le.transaction_date) IN (8, 9) THEN 'Ganesh_Season'
                    ELSE 'Regular'
                END as season,
                le.id as transaction_id
            FROM ledger_entries le
            JOIN line_items li ON le.id = li.ledger_entry_id
            WHERE le.store_id = $1 
                AND le.transaction_date >= NOW() - INTERVAL '${lookbackDays} days'
        ),
        seasonal_pairs AS (
            SELECT 
                t1.product_name as product_a,
                t2.product_name as product_b,
                t1.season,
                COUNT(*) as pair_count
            FROM seasonal_transactions t1
            JOIN seasonal_transactions t2 ON t1.transaction_id = t2.transaction_id
            WHERE t1.product_name < t2.product_name
                AND t1.season != 'Regular'
            GROUP BY t1.product_name, t2.product_name, t1.season
            HAVING COUNT(*) >= 2
        )
        SELECT * FROM seasonal_pairs
        ORDER BY pair_count DESC
        LIMIT 15
    `;
    
    const { rows } = await pool.query(query, [storeId]);
    
    return rows.map(row => ({
        productA: row.product_a,
        productB: row.product_b,
        type: RELATIONSHIP_TYPES.SEASONAL_PAIR,
        strength: Math.min(row.pair_count / 3, 0.80),
        evidence: {
            pairCount: row.pair_count,
            season: row.season
        },
        context: row.season,
        businessReason: `${row.product_a} and ${row.product_b} are popular together during ${row.season}`
    }));
}

// ── Relationship-Based Sales Intelligence ──────────────────────────────────

/**
 * Generate sales expansion recommendations based on relationships
 */
async function generateSalesExpansionGuidance(storeId, currentInventory, context = {}) {
    const relationships = await getStrongRelationships(storeId, 0.30);
    const productExperience = await getProductExperience(storeId);
    
    const guidance = {
        crossSellOpportunities: [],
        basketExpansion: [],
        missingComplementary: [],
        strengthAmplifiers: []
    };
    
    const inventoryMap = new Map(
        currentInventory.map(item => [item.product.toLowerCase(), item])
    );
    
    // Cross-sell opportunities (what to suggest when customer buys X)
    for (const rel of relationships.filter(r => r.relationship_type === RELATIONSHIP_TYPES.FREQUENTLY_TOGETHER)) {
        const hasA = inventoryMap.has(rel.product_a.toLowerCase());
        const hasB = inventoryMap.has(rel.product_b.toLowerCase());
        
        if (hasA && hasB) {
            guidance.crossSellOpportunities.push({
                trigger: rel.product_a,
                suggest: rel.product_b,
                reason: `${Math.round(rel.strength * 100)}% of customers buying ${rel.product_a} also want ${rel.product_b}`,
                strength: rel.strength,
                action: 'Display together or suggest during sale'
            });
        }
    }
    
    // Missing complementary items (expansion opportunities)
    for (const rel of relationships.filter(r => r.relationship_type === RELATIONSHIP_TYPES.COMPLEMENTARY)) {
        const hasA = inventoryMap.has(rel.product_a.toLowerCase());
        const hasB = inventoryMap.has(rel.product_b.toLowerCase());
        
        if (hasA && !hasB) {
            guidance.missingComplementary.push({
                existing: rel.product_a,
                missing: rel.product_b,
                opportunity: `Customers buying ${rel.product_a} often want ${rel.product_b}`,
                potentialRevenue: 'high',
                action: `Consider stocking ${rel.product_b} to increase basket size`,
                strength: rel.strength
            });
        } else if (!hasA && hasB) {
            guidance.missingComplementary.push({
                existing: rel.product_b,
                missing: rel.product_a,
                opportunity: `Customers buying ${rel.product_b} often want ${rel.product_a}`,
                potentialRevenue: 'high',
                action: `Consider stocking ${rel.product_a} to increase basket size`,
                strength: rel.strength
            });
        }
    }
    
    // Strength amplifiers (products that make each other more successful)
    for (const [product, experience] of Object.entries(productExperience)) {
        if (experience.confidence > 0.60) {
            const relatedProducts = relationships.filter(rel => 
                (rel.product_a.toLowerCase() === product.toLowerCase() || 
                 rel.product_b.toLowerCase() === product.toLowerCase()) &&
                rel.strength > 0.50
            );
            
            if (relatedProducts.length > 0) {
                guidance.strengthAmplifiers.push({
                    strongProduct: product,
                    amplifiers: relatedProducts.map(rel => ({
                        product: rel.product_a.toLowerCase() === product.toLowerCase() ? rel.product_b : rel.product_a,
                        relationship: rel.relationship_type,
                        strength: rel.strength
                    })),
                    strategy: `${product} is a strength product. Stock its amplifiers for maximum impact`
                });
            }
        }
    }
    
    return guidance;
}

/**
 * Get strong relationships from database
 */
async function getStrongRelationships(storeId, minStrength = 0.30) {
    const query = `
        SELECT product_a, product_b, relationship_type, strength, occurrences, context
        FROM product_relationships 
        WHERE store_id = $1 AND strength >= $2
        ORDER BY strength DESC, occurrences DESC
    `;
    
    const { rows } = await pool.query(query, [storeId, minStrength]);
    return rows;
}

// ── Festival Context Intelligence ──────────────────────────────────────────

/**
 * Adapt product relationships for festival context
 */
async function getFestivalRelationshipGuidance(storeId, festivalName, daysUntilFestival) {
    const seasonalRelationships = await pool.query(`
        SELECT product_a, product_b, relationship_type, strength, occurrences, context
        FROM product_relationships 
        WHERE store_id = $1 
            AND relationship_type = 'seasonal_pair'
            AND (context ILIKE '%' || $2 || '%' OR context ILIKE '%Season%')
        ORDER BY strength DESC
    `, [storeId, festivalName]);
    
    // Also get general strong relationships that might apply to festivals
    const generalStrong = await pool.query(`
        SELECT product_a, product_b, relationship_type, strength, occurrences
        FROM product_relationships 
        WHERE store_id = $1 
            AND strength > 0.60
            AND relationship_type IN ('frequently_together', 'complementary')
        ORDER BY strength DESC
    `, [storeId]);
    
    const festivalGuidance = [];
    
    // Seasonal relationships get priority
    for (const rel of seasonalRelationships.rows) {
        festivalGuidance.push({
            productA: rel.product_a,
            productB: rel.product_b,
            urgency: daysUntilFestival <= 3 ? 'critical' : daysUntilFestival <= 7 ? 'high' : 'moderate',
            reason: `${rel.product_a} and ${rel.product_b} are popular together during ${festivalName}`,
            demandNote: `Stock both together - festival demand creates strong pairing`,
            relationship: rel.relationship_type,
            strength: rel.strength
        });
    }
    
    return festivalGuidance;
}

// ── Utility Functions ──────────────────────────────────────────────────────

/**
 * Store discovered relationship in database
 */
async function storeRelationship(storeId, relationship) {
    const query = `
        INSERT INTO product_relationships (
            store_id, product_a, product_b, relationship_type, 
            strength, occurrences, context
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (store_id, product_a, product_b, relationship_type, context)
        DO UPDATE SET 
            strength = GREATEST(product_relationships.strength, EXCLUDED.strength),
            occurrences = product_relationships.occurrences + 1,
            last_occurrence = NOW()
    `;
    
    await pool.query(query, [
        storeId,
        relationship.productA,
        relationship.productB,
        relationship.type,
        relationship.strength,
        1,
        relationship.context || null
    ]);
}

/**
 * Remove duplicate relationships
 */
function deduplicateRelationships(relationships) {
    const seen = new Set();
    return relationships.filter(rel => {
        const key = `${rel.productA}-${rel.productB}-${rel.type}-${rel.context || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Convert month number to name
 */
function getMonthName(monthNum) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNum - 1] || 'Unknown';
}

module.exports = {
    discoverProductRelationships,
    generateSalesExpansionGuidance,
    getFestivalRelationshipGuidance,
    getStrongRelationships,
    RELATIONSHIP_TYPES
};