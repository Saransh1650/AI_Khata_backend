'use strict';
/**
 * RAG Memory System - Learning Demo
 * ──────────────────────────────────
 * 
 * This shows how the AI learns from transaction data and builds memory
 */

require('dotenv').config();
const pool = require('../config/database');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function separator(title) {
    log(`\n${'═'.repeat(60)}`, 'cyan');
    log(`  ${title}`, 'bright');
    log('═'.repeat(60), 'cyan');
}

async function simulateRagLearning() {
    try {
        separator('🧠 RAG Memory System - Learning Simulation');
        
        // Get our test user
        const userResult = await pool.query('SELECT id FROM users WHERE name = $1', ['testuser_rag_demo']);
        const userId = userResult.rows[0].id;
        
        // Create a store for our demo
        log('\n🏪 Creating demo store...', 'blue');
        const storeResult = await pool.query(
            'INSERT INTO stores (user_id, name, region, type) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id',
            [userId, 'Sharma General Store', 'Mumbai', 'grocery']
        );
        
        let storeId;
        if (storeResult.rows.length > 0) {
            storeId = storeResult.rows[0].id;
            log(`✅ Created store: Sharma General Store (ID: ${storeId})`, 'green');
        } else {
            // Store already exists, get it
            const existingStore = await pool.query(
                'SELECT id FROM stores WHERE user_id = $1 AND name = $2',
                [userId, 'Sharma General Store']
            );
            storeId = existingStore.rows[0].id;
            log(`✅ Using existing store: Sharma General Store (ID: ${storeId})`, 'yellow');
        }
        
        // Clear existing RAG memory for fresh demo
        await pool.query('DELETE FROM shop_memory WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM product_relationships WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM experience_insights WHERE store_id = $1', [storeId]);
        
        log('\n🔄 Analyzing transaction patterns...', 'blue');
        
        // Step 1: Learn product behaviors
        log('\n  📊 Step 1: Learning individual product behaviors', 'magenta');
        const productAnalysis = await pool.query(`
            SELECT 
                oi.name as product,
                COUNT(DISTINCT le.merchant) as customers,
                SUM(oi.qty) as total_qty,
                AVG(le.total_amount) as avg_transaction_value,
                COUNT(*) as frequency
            FROM order_items oi
            JOIN ledger_entries le ON oi.user_id = le.user_id
            WHERE oi.user_id = $1
            GROUP BY oi.name
            ORDER BY frequency DESC, total_qty DESC
        `, [userId]);
        
        for (const product of productAnalysis.rows) {
            const memoryData = {
                avg_transaction_value: parseFloat(product.avg_transaction_value),
                total_quantity_sold: parseInt(product.total_qty),
                customer_count: parseInt(product.customers),
                frequency_score: parseInt(product.frequency),
                performance: product.frequency >= 2 ? 'high' : 'medium'
            };
            
            await pool.query(`
                INSERT INTO shop_memory (store_id, memory_type, context, memory_data, confidence, frequency)
                VALUES ($1, 'product_behavior', $2, $3, $4, $5)
            `, [storeId, product.product, JSON.stringify(memoryData), 0.75, product.frequency]);
            
            log(`    🧩 ${product.product}: Sold ${product.total_qty} units to ${product.customers} customers (Performance: ${memoryData.performance})`, 'cyan');
        }
        
        // Step 2: Discover product relationships
        log('\n  🔗 Step 2: Discovering product relationships', 'magenta');
        
        // Find products bought by same customers
        const relationships = await pool.query(`
            WITH customer_products AS (
                SELECT DISTINCT 
                    le.merchant as customer,
                    oi.name as product
                FROM ledger_entries le
                JOIN order_items oi ON le.user_id = oi.user_id
                WHERE le.user_id = $1
            ),
            product_pairs AS (
                SELECT 
                    cp1.product as product_a,
                    cp2.product as product_b,
                    COUNT(*) as co_occurrence
                FROM customer_products cp1
                JOIN customer_products cp2 ON cp1.customer = cp2.customer AND cp1.product < cp2.product
                GROUP BY cp1.product, cp2.product
                HAVING COUNT(*) >= 2
            )
            SELECT * FROM product_pairs ORDER BY co_occurrence DESC
        `, [userId]);
        
        for (const rel of relationships.rows) {
            const strength = Math.min(0.95, rel.co_occurrence * 0.25);
            
            await pool.query(`
                INSERT INTO product_relationships (store_id, product_a, product_b, relationship_type, strength, occurrences)
                VALUES ($1, $2, $3, 'frequently_together', $4, $5)
            `, [storeId, rel.product_a, rel.product_b, strength, rel.co_occurrence]);
            
            log(`    🤝 ${rel.product_a} ↔ ${rel.product_b}: ${rel.co_occurrence} co-purchases (Strength: ${strength.toFixed(2)})`, 'cyan');
        }
        
        // Step 3: Generate experience insights
        log('\n  💡 Step 3: Generating experience insights', 'magenta');
        
        // Find top performing products
        const topProducts = await pool.query(`
            SELECT 
                oi.name,
                SUM(oi.qty) as total_qty,
                COUNT(DISTINCT le.merchant) as customer_count
            FROM order_items oi
            JOIN ledger_entries le ON oi.user_id = le.user_id
            WHERE oi.user_id = $1
            GROUP BY oi.name
            ORDER BY total_qty DESC
            LIMIT 3
        `, [userId]);
        
        for (const [index, product] of topProducts.rows.entries()) {
            const insight = {
                product_name: product.name,
                total_quantity: parseInt(product.total_qty),
                customer_reach: parseInt(product.customer_count),
                rank: index + 1,
                insight_type: index === 0 ? 'star_product' : 'strong_performer'
            };
            
            const title = index === 0 ? `Star Product: ${product.name}` : `Strong Performer: ${product.name}`;
            const description = `${product.name} has strong demand with ${product.total_qty} total units sold across ${product.customer_count} different customers. This indicates consistent customer preference.`;
            
            await pool.query(`
                INSERT INTO experience_insights (store_id, insight_category, title, description, evidence, confidence, impact)
                VALUES ($1, 'strength_product', $2, $3, $4, $5, $6)
            `, [storeId, title, description, JSON.stringify(insight), 0.85, index === 0 ? 'high' : 'medium']);
            
            log(`    ⭐ ${title}: ${product.total_qty} units sold to ${product.customer_count} customers`, 'cyan');
        }
        
        // Customer behavior insight
        const customerInsight = await pool.query(`
            SELECT 
                le.merchant,
                COUNT(*) as visits,
                SUM(le.total_amount) as total_spent,
                AVG(le.total_amount) as avg_spent
            FROM ledger_entries le
            WHERE le.user_id = $1
            GROUP BY le.merchant
            ORDER BY visits DESC, total_spent DESC
        `, [userId]);
        
        const loyalCustomer = customerInsight.rows[0];
        const customerBehaviorInsight = {
            top_customer: loyalCustomer.merchant,
            visit_frequency: parseInt(loyalCustomer.visits),
            total_value: parseFloat(loyalCustomer.total_spent),
            avg_transaction: parseFloat(loyalCustomer.avg_spent),
            loyalty_score: loyalCustomer.visits >= 3 ? 'high' : 'medium'
        };
        
        await pool.query(`
            INSERT INTO experience_insights (store_id, insight_category, title, description, evidence, confidence, impact)
            VALUES ($1, 'customer_preference', $2, $3, $4, $5, $6)
        `, [storeId, `Loyal Customer Pattern: ${loyalCustomer.merchant}`, 
            `${loyalCustomer.merchant} shows strong loyalty with ${loyalCustomer.visits} visits and ₹${loyalCustomer.total_spent} total spending. Average transaction value is ₹${parseFloat(loyalCustomer.avg_spent).toFixed(2)}.`,
            JSON.stringify(customerBehaviorInsight), 0.80, 'high']);
        
        log(`    👤 Most Loyal: ${loyalCustomer.merchant} (${loyalCustomer.visits} visits, ₹${loyalCustomer.total_spent} total)`, 'cyan');
        
        return storeId;
        
    } catch (error) {
        log(`❌ Error in RAG learning: ${error.message}`, 'red');
        throw error;
    }
}

async function showRagMemory(storeId) {
    try {
        separator('🧠 RAG Memory System - What AI Learned');
        
        // Show shop memory
        log('\n📚 Shop Memory (Product Behaviors):', 'blue');
        const memories = await pool.query(`
            SELECT context, memory_data, confidence, frequency
            FROM shop_memory 
            WHERE store_id = $1 AND memory_type = 'product_behavior'
            ORDER BY confidence DESC, frequency DESC
        `, [storeId]);
        
        memories.rows.forEach((memory, idx) => {
            const data = memory.memory_data;
            log(`  ${idx + 1}. ${memory.context}`, 'yellow');
            log(`     Performance: ${data.performance} | Confidence: ${memory.confidence} | Freq: ${memory.frequency}`, 'cyan');
            log(`     Sold: ${data.total_quantity_sold} units | Customers: ${data.customer_count} | Avg Value: ₹${data.avg_transaction_value.toFixed(2)}`, 'cyan');
            log('', 'reset');
        });
        
        // Show relationships
        log('\n🔗 Product Relationships:', 'blue');
        const relationships = await pool.query(`
            SELECT product_a, product_b, strength, occurrences
            FROM product_relationships
            WHERE store_id = $1
            ORDER BY strength DESC
        `, [storeId]);
        
        relationships.rows.forEach((rel, idx) => {
            log(`  ${idx + 1}. ${rel.product_a} ↔ ${rel.product_b}`, 'yellow');
            log(`     Strength: ${rel.strength} | Co-purchases: ${rel.occurrences}`, 'cyan');
            log('', 'reset');
        });
        
        // Show insights
        log('\n💡 Experience Insights:', 'blue');
        const insights = await pool.query(`
            SELECT title, description, confidence, impact
            FROM experience_insights
            WHERE store_id = $1
            ORDER BY confidence DESC, impact DESC
        `, [storeId]);
        
        insights.rows.forEach((insight, idx) => {
            log(`  ${idx + 1}. ${insight.title}`, 'yellow');
            log(`     ${insight.description}`, 'cyan');
            log(`     Confidence: ${insight.confidence} | Impact: ${insight.impact}`, 'cyan');
            log('', 'reset');
        });
        
    } catch (error) {
        log(`❌ Error showing RAG memory: ${error.message}`, 'red');
        throw error;
    }
}

async function generateSmartRecommendations(storeId) {
    try {
        separator('🤖 Smart AI Recommendations Based on Memory');
        
        log('\n🎯 Product Recommendations:', 'blue');
        
        // Recommend based on relationships
        const recommendations = await pool.query(`
            WITH top_products AS (
                SELECT context as product, memory_data
                FROM shop_memory 
                WHERE store_id = $1 AND memory_type = 'product_behavior'
                ORDER BY confidence DESC, frequency DESC
                LIMIT 3
            ),
            related_products AS (
                SELECT DISTINCT
                    CASE 
                        WHEN pr.product_a = tp.product THEN pr.product_b
                        ELSE pr.product_a
                    END as suggested_product,
                    pr.strength,
                    tp.product as based_on
                FROM product_relationships pr
                JOIN top_products tp ON (pr.product_a = tp.product OR pr.product_b = tp.product)
                WHERE pr.store_id = $1
                ORDER BY pr.strength DESC
            )
            SELECT * FROM related_products LIMIT 5
        `, [storeId]);
        
        recommendations.rows.forEach((rec, idx) => {
            log(`  ${idx + 1}. Recommend "${rec.suggested_product}" to customers buying "${rec.based_on}"`, 'green');
            log(`     Reason: ${(rec.strength * 100).toFixed(0)}% of customers buy these together`, 'cyan');
        });
        
        // Stock recommendations
        log('\n📦 Stock Management Recommendations:', 'blue');
        const stockRecs = await pool.query(`
            SELECT 
                context as product,
                memory_data->>'total_quantity_sold' as qty_sold,
                memory_data->>'customer_count' as customers,
                frequency
            FROM shop_memory 
            WHERE store_id = $1 AND memory_type = 'product_behavior'
            ORDER BY (memory_data->>'total_quantity_sold')::int DESC
        `, [storeId]);
        
        stockRecs.rows.forEach((stock, idx) => {
            const demand = parseInt(stock.qty_sold) >= 5 ? 'High' : 'Medium';
            const action = demand === 'High' ? 'Increase stock' : 'Monitor demand';
            log(`  ${idx + 1}. ${stock.product}: ${action}`, 'green');
            log(`     Demand: ${demand} (${stock.qty_sold} units to ${stock.customers} customers)`, 'cyan');
        });
        
    } catch (error) {
        log(`❌ Error generating recommendations: ${error.message}`, 'red');
        throw error;
    }
}

async function runRagDemo() {
    try {
        log('🚀 RAG Memory System - Learning Demo', 'bright');
        log('This shows how AI learns from your transaction data and builds intelligence\n', 'cyan');
        
        const storeId = await simulateRagLearning();
        await showRagMemory(storeId);
        await generateSmartRecommendations(storeId);
        
        separator('🎉 RAG Memory Demo Complete!');
        log('What the AI learned:', 'bright');
        log('✅ Individual product performance patterns', 'green');
        log('✅ Which products customers buy together', 'green');
        log('✅ Customer loyalty and spending patterns', 'green');
        log('✅ Generated smart recommendations based on memory', 'green');
        
        log('\n💡 This memory will help provide intelligent suggestions for:', 'yellow');
        log('  • What to stock more of', 'cyan');
        log('  • What products to recommend together', 'cyan');
        log('  • Which customers are most valuable', 'cyan');
        log('  • How to improve store performance', 'cyan');
        
    } catch (error) {
        log(`💥 Demo failed: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    runRagDemo();
}

module.exports = {
    runRagDemo,
    simulateRagLearning,
    showRagMemory,
    generateSmartRecommendations
};