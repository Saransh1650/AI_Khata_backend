'use strict';
/**
 * Shop Memory Service — RAG-Driven Sales Intelligence
 * ──────────────────────────────────────────────────────
 * Implements the core RAG memory system for AI Khata.
 * 
 * This service learns from shop behavior patterns and provides
 * experience-driven guidance rather than reactive inventory alerts.
 * 
 * Philosophy:
 * - RAG memory represents shop experience
 * - Experience guides decisions over momentary signals
 * - Focus on opportunities, not just problems
 * - Understand shop identity and behavioral patterns
 */
const pool = require('../config/database');

// ── Core Memory Operations ───────────────────────────────────────────────────

/**
 * Learn from a transaction - extract patterns and update memory
 */
async function learnFromTransaction(userId, storeId, transactionData) {
    const { line_items, transaction_date, merchant, total_amount } = transactionData;
    
    if (!line_items || !line_items.length) return;

    try {
        await Promise.all([
            learnProductBehavior(storeId, line_items, transaction_date),
            learnProductRelationships(storeId, line_items, transaction_date),
            learnOperationalRhythm(storeId, transaction_date, total_amount),
        ]);
        
        console.log(`[ShopMemory] Learned from transaction for store ${storeId}`);
    } catch (error) {
        console.error('[ShopMemory] Learning error:', error);
    }
}

/**
 * Learn how individual products behave in this shop
 */
async function learnProductBehavior(storeId, lineItems, transactionDate) {
    const dayOfWeek = new Date(transactionDate).toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek);
    
    for (const item of lineItems) {
        const { product_name, quantity, total_price } = item;
        
        // Learn product frequency and performance
        const behaviorData = {
            avg_quantity: quantity,
            avg_price: total_price,
            day_of_week: dayOfWeek,
            is_weekend: isWeekend,
            last_transaction_date: transactionDate,
            performance_indicator: quantity > 1 ? 'high_volume' : 'regular'
        };

        await upsertShopMemory(storeId, 'product_behavior', product_name, behaviorData);
    }
}

/**
 * Learn which products are bought together
 */
async function learnProductRelationships(storeId, lineItems, transactionDate) {
    if (lineItems.length < 2) return; // Need at least 2 products for relationships
    
    const currentMonth = new Date(transactionDate).toLocaleDateString('en-US', { month: 'long' });
    
    // Learn pairwise relationships
    for (let i = 0; i < lineItems.length; i++) {
        for (let j = i + 1; j < lineItems.length; j++) {
            const productA = lineItems[i].product_name;
            const productB = lineItems[j].product_name;
            
            // Create bidirectional relationships
            await updateRelationshipStrength(storeId, productA, productB, 'frequently_together', currentMonth);
            await updateRelationshipStrength(storeId, productB, productA, 'frequently_together', currentMonth);
        }
    }
}

/**
 * Learn operational patterns and rhythms
 */
async function learnOperationalRhythm(storeId, transactionDate, totalAmount) {
    const dayOfWeek = new Date(transactionDate).toLocaleDateString('en-US', { weekday: 'long' });
    const hour = new Date(transactionDate).getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    
    const rhythmData = {
        day_of_week: dayOfWeek,
        time_of_day: timeOfDay,
        transaction_value: totalAmount,
        peak_indicator: totalAmount > 500 ? 'high_value' : 'regular_value'
    };
    
    await upsertShopMemory(storeId, 'operational_rhythm', `${dayOfWeek}_${timeOfDay}`, rhythmData);
}

/**
 * Upsert memory entry with pattern data
 */
async function upsertShopMemory(storeId, memoryType, context, memoryData) {
    const query = `
        INSERT INTO shop_memory (store_id, memory_type, context, memory_data, frequency, confidence)
        VALUES ($1, $2, $3, $4, 1, 0.30)
        ON CONFLICT (store_id, memory_type, context)
        DO UPDATE SET 
            memory_data = CASE 
                WHEN shop_memory.frequency > 5 THEN shop_memory.memory_data || $4
                ELSE $4
            END,
            frequency = shop_memory.frequency + 1,
            confidence = LEAST(1.0, shop_memory.confidence + 0.05),
            last_seen = NOW(),
            updated_at = NOW()
    `;
    
    await pool.query(query, [storeId, memoryType, context, JSON.stringify(memoryData)]);
}

/**
 * Update product relationship strength
 */
async function updateRelationshipStrength(storeId, productA, productB, relationshipType, context = null) {
    const query = `
        SELECT update_relationship_strength($1, $2, $3, $4, $5)
    `;
    
    await pool.query(query, [storeId, productA, productB, relationshipType, context]);
}

// ── Memory Retrieval for Guidance ───────────────────────────────────────────

/**
 * Get shop's behavioral patterns for specific products
 */
async function getProductExperience(storeId, products = []) {
    let query = `
        SELECT context, memory_data, confidence, frequency
        FROM shop_memory 
        WHERE store_id = $1 AND memory_type = 'product_behavior'
    `;
    let params = [storeId];
    
    if (products.length > 0) {
        query += ` AND context = ANY($2)`;
        params.push(products);
    }
    
    query += ` ORDER BY confidence DESC, frequency DESC`;
    
    const { rows } = await pool.query(query, params);
    
    return rows.reduce((acc, row) => {
        acc[row.context] = {
            ...row.memory_data,
            confidence: row.confidence,
            frequency: row.frequency
        };
        return acc;
    }, {});
}

/**
 * Get product relationships for recommendation engine
 */
async function getProductRelationships(storeId, targetProducts = [], minStrength = 0.30) {
    let query = `
        SELECT product_a, product_b, relationship_type, strength, occurrences, context
        FROM product_relationships 
        WHERE store_id = $1 AND strength >= $2
    `;
    let params = [storeId, minStrength];
    
    if (targetProducts.length > 0) {
        query += ` AND (product_a = ANY($3) OR product_b = ANY($3))`;
        params.push(targetProducts);
    }
    
    query += ` ORDER BY strength DESC, occurrences DESC`;
    
    const { rows } = await pool.query(query, params);
    return rows;
}

/**
 * Get high-level experience insights about the shop
 */
async function getExperienceInsights(storeId, categories = []) {
    let query = `
        SELECT insight_category, title, description, evidence, confidence, impact
        FROM experience_insights 
        WHERE store_id = $1
    `;
    let params = [storeId];
    
    if (categories.length > 0) {
        query += ` AND insight_category = ANY($2)`;
        params.push(categories);
    }
    
    query += ` ORDER BY confidence DESC, impact DESC`;
    
    const { rows } = await pool.query(query, params);
    return rows;
}

/**
 * Get operational rhythm patterns
 */
async function getOperationalPatterns(storeId) {
    const query = `
        SELECT context, memory_data, confidence, frequency
        FROM shop_memory 
        WHERE store_id = $1 AND memory_type = 'operational_rhythm'
        ORDER BY confidence DESC, frequency DESC
    `;
    
    const { rows } = await pool.query(query, [storeId]);
    return rows;
}

// ── Intelligence Generation ─────────────────────────────────────────────────

/**
 * Generate RAG-driven product recommendations based on shop memory
 */
async function generateMemoryBasedRecommendations(storeId, currentInventory = [], context = {}) {
    const [productExperience, relationships, insights] = await Promise.all([
        getProductExperience(storeId),
        getProductRelationships(storeId),
        getExperienceInsights(storeId)
    ]);
    
    return {
        // A. Strength-based suggestions (products that historically perform well)
        strengthBased: identifyStrengthProducts(productExperience, currentInventory),
        
        // B. Expansion suggestions (complementary items to increase basket size)
        expansionBased: identifyExpansionOpportunities(relationships, currentInventory),
        
        // C. Experience-driven insights
        experienceInsights: insights,
        
        // D. Memory confidence
        memoryStrength: calculateMemoryStrength(productExperience, relationships)
    };
}

/**
 * Identify products that consistently perform well (strength-based)
 */
function identifyStrengthProducts(productExperience, currentInventory) {
    const strengthProducts = [];
    
    for (const [product, experience] of Object.entries(productExperience)) {
        if (experience.confidence > 0.60 && experience.frequency >= 3) {
            const currentStock = currentInventory.find(item => 
                item.product.toLowerCase() === product.toLowerCase()
            );
            
            strengthProducts.push({
                product,
                reason: experience.performance_indicator === 'high_volume' 
                    ? 'Consistently sells in high volumes'
                    : 'Regular reliable seller',
                currentStock: currentStock?.quantity || 0,
                recommendation: currentStock && currentStock.quantity < 10 
                    ? 'Consider restocking - this is a strength product'
                    : 'Monitor closely - key revenue driver',
                confidence: experience.confidence
            });
        }
    }
    
    return strengthProducts.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/**
 * Identify expansion opportunities based on product relationships
 */
function identifyExpansionOpportunities(relationships, currentInventory) {
    const opportunities = [];
    const inventoryProducts = currentInventory.map(item => item.product.toLowerCase());
    
    // Group relationships by strength
    const strongRelationships = relationships.filter(rel => rel.strength > 0.50);
    
    for (const rel of strongRelationships) {
        const hasProductA = inventoryProducts.includes(rel.product_a.toLowerCase());
        const hasProductB = inventoryProducts.includes(rel.product_b.toLowerCase());
        
        if (hasProductA && !hasProductB) {
            opportunities.push({
                trigger: rel.product_a,
                opportunity: rel.product_b,
                reason: `Customers buying ${rel.product_a} often also want ${rel.product_b}`,
                relationshipType: rel.relationship_type,
                strength: rel.strength,
                suggestion: `Consider stocking ${rel.product_b} to increase basket size`
            });
        } else if (hasProductB && !hasProductA) {
            opportunities.push({
                trigger: rel.product_b,
                opportunity: rel.product_a,
                reason: `Customers buying ${rel.product_b} often also want ${rel.product_a}`,
                relationshipType: rel.relationship_type,
                strength: rel.strength,
                suggestion: `Consider stocking ${rel.product_a} to increase basket size`
            });
        }
    }
    
    return opportunities.sort((a, b) => b.strength - a.strength).slice(0, 5);
}

/**
 * Calculate overall memory strength for the shop
 */
function calculateMemoryStrength(productExperience, relationships) {
    const expEntries = Object.values(productExperience);
    const avgConfidence = expEntries.length > 0 
        ? expEntries.reduce((sum, exp) => sum + exp.confidence, 0) / expEntries.length 
        : 0;
    
    const avgFrequency = expEntries.length > 0
        ? expEntries.reduce((sum, exp) => sum + exp.frequency, 0) / expEntries.length
        : 0;
    
    const relationshipStrength = relationships.length > 0
        ? relationships.reduce((sum, rel) => sum + rel.strength, 0) / relationships.length
        : 0;
    
    return {
        overallStrength: (avgConfidence * 0.4) + (Math.min(avgFrequency / 10, 1) * 0.3) + (relationshipStrength * 0.3),
        productMemoryEntries: expEntries.length,
        relationshipEntries: relationships.length,
        isExperienced: expEntries.length >= 10 && relationships.length >= 5
    };
}

// ── Experience Insight Generation ───────────────────────────────────────────

/**
 * Generate high-level insights about shop identity and behavior
 */
async function generateExperienceInsights(storeId) {
    const [productExperience, relationships, operationalPatterns] = await Promise.all([
        getProductExperience(storeId),
        getProductRelationships(storeId),
        getOperationalPatterns(storeId)
    ]);
    
    const insights = [];
    
    // Shop Identity Analysis
    const topProducts = Object.entries(productExperience)
        .filter(([_, exp]) => exp.frequency >= 5)
        .sort(([_, a], [__, b]) => b.confidence - a.confidence)
        .slice(0, 5);
    
    if (topProducts.length >= 3) {
        const productList = topProducts.map(([product]) => product).join(', ');
        insights.push({
            category: 'shop_identity',
            title: 'Core Product Strengths',
            description: `This shop consistently performs well with: ${productList}`,
            evidence: { topProducts: topProducts.map(([product, exp]) => ({ product, confidence: exp.confidence })) },
            confidence: 0.80,
            impact: 'high'
        });
    }
    
    // Relationship Insights
    const strongPairs = relationships
        .filter(rel => rel.strength > 0.70 && rel.occurrences >= 3)
        .slice(0, 3);
    
    if (strongPairs.length > 0) {
        insights.push({
            category: 'customer_preference',
            title: 'Strong Product Pairings',
            description: strongPairs.map(rel => `${rel.product_a} + ${rel.product_b}`).join('; '),
            evidence: { strongPairs },
            confidence: 0.75,
            impact: 'medium'
        });
    }
    
    // Store insights in database
    for (const insight of insights) {
        await upsertExperienceInsight(storeId, insight);
    }
    
    return insights;
}

/**
 * Upsert an experience insight
 */
async function upsertExperienceInsight(storeId, insight) {
    const query = `
        INSERT INTO experience_insights (
            store_id, insight_category, title, description, evidence, confidence, impact
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (store_id, insight_category, title)
        DO UPDATE SET 
            description = $4,
            evidence = $5,
            confidence = $6,
            impact = $7,
            updated_at = NOW()
    `;
    
    await pool.query(query, [
        storeId,
        insight.category,
        insight.title,
        insight.description,
        JSON.stringify(insight.evidence),
        insight.confidence,
        insight.impact
    ]);
}

module.exports = {
    // Core learning functions
    learnFromTransaction,
    
    // Memory retrieval
    getProductExperience,
    getProductRelationships,
    getExperienceInsights,
    getOperationalPatterns,
    
    // Intelligence generation
    generateMemoryBasedRecommendations,
    generateExperienceInsights,
    
    // Utility functions
    calculateMemoryStrength
};