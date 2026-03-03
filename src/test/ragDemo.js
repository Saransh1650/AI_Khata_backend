'use strict';
/**
 * RAG Memory System Test & Demo Script
 * ────────────────────────────────────────
 *
 * This script demonstrates the complete RAG memory system with sample data.
 * Use it to understand how the system learns and what data looks like in tables.
 *
 * Run: node src/test/ragDemo_clean.js
 */
require('dotenv').config();
const pool = require('../config/database');
const { initializeStoreMemory, checkMemoryHealth } = require('../ai/transactionLearner');
const { generateMemoryBasedRecommendations } = require('../ai/shopMemory');
const { generateSalesExpansionGuidance } = require('../ai/relationshipIntelligence');
const { generateExperienceGuidance } = require('../ai/experienceEngine');

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

// Sample data for demonstration
const SAMPLE_STORE = {
    name: 'Sharma General Store',
    type: 'grocery',
    region: 'Mumbai'
};

const SAMPLE_USER = {
    name: 'testuser_rag_demo',
    password: 'demo123'
};

// Sample transactions showing realistic grocery store patterns
const SAMPLE_TRANSACTIONS = [
    // Week 1 - Basic grocery patterns
    {
        merchant: 'Customer A',
        transaction_date: '2026-02-01 10:30:00',
        total_amount: 145.5,
        line_items: [
            { product_name: 'Milk', quantity: 2, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 1, unit_price: 20.0 },
            { product_name: 'Butter', quantity: 1, unit_price: 80.5 }
        ]
    },
    {
        merchant: 'Customer B',
        transaction_date: '2026-02-01 14:15:00',
        total_amount: 280.0,
        line_items: [
            { product_name: 'Rice', quantity: 1, unit_price: 150.0 },
            { product_name: 'Oil', quantity: 1, unit_price: 130.0 }
        ]
    },
    {
        merchant: 'Customer C',
        transaction_date: '2026-02-02 09:45:00',
        total_amount: 95.0,
        line_items: [
            { product_name: 'Tea', quantity: 1, unit_price: 45.0 },
            { product_name: 'Sugar', quantity: 1, unit_price: 50.0 }
        ]
    },
    // Week 2 - Repeat customers with variations
    {
        merchant: 'Customer A',
        transaction_date: '2026-02-08 11:00:00',
        total_amount: 175.0,
        line_items: [
            { product_name: 'Milk', quantity: 2, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 2, unit_price: 20.0 },
            { product_name: 'Eggs', quantity: 1, unit_price: 105.0 }
        ]
    },
    {
        merchant: 'Customer B',
        transaction_date: '2026-02-08 16:30:00',
        total_amount: 320.0,
        line_items: [
            { product_name: 'Rice', quantity: 1, unit_price: 150.0 },
            { product_name: 'Oil', quantity: 1, unit_price: 130.0 },
            { product_name: 'Spices', quantity: 1, unit_price: 40.0 }
        ]
    },
    // Week 3 - Seasonal/Festival pattern
    {
        merchant: 'Customer D',
        transaction_date: '2026-02-15 14:20:00',
        total_amount: 450.0,
        line_items: [
            { product_name: 'Sweets', quantity: 2, unit_price: 150.0 },
            { product_name: 'Dry Fruits', quantity: 1, unit_price: 150.0 }
        ]
    },
    {
        merchant: 'Customer A',
        transaction_date: '2026-02-15 10:15:00',
        total_amount: 320.0,
        line_items: [
            { product_name: 'Milk', quantity: 3, unit_price: 25.0 },
            { product_name: 'Sweets', quantity: 1, unit_price: 150.0 },
            { product_name: 'Fruits', quantity: 1, unit_price: 95.0 }
        ]
    },
    // Month 2 - Established patterns
    {
        merchant: 'Customer A',
        transaction_date: '2026-03-01 10:45:00',
        total_amount: 165.0,
        line_items: [
            { product_name: 'Milk', quantity: 2, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 1, unit_price: 20.0 },
            { product_name: 'Vegetables', quantity: 1, unit_price: 95.0 }
        ]
    }
];

// Utility functions
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function separator(title) {
    log(`\n${'═'.repeat(60)}`, 'cyan');
    log(`  ${title}`, 'bright');
    log('═'.repeat(60), 'cyan');
}

async function createTestUser() {
    try {
        // Check if user exists
        const userCheck = await pool.query(
            'SELECT id FROM users WHERE name = $1',
            [SAMPLE_USER.name]
        );

        if (userCheck.rows.length === 0) {
            // Create test user with hashed password
            const result = await pool.query(
                'INSERT INTO users (name, password_hash, created_at) VALUES ($1, $2, NOW()) RETURNING id, name',
                [SAMPLE_USER.name, 'demo_hash_' + SAMPLE_USER.password]
            );
            log(`✅ Created test user: ${result.rows[0].name} (ID: ${result.rows[0].id})`, 'green');
            return result.rows[0].id;
        } else {
            log(`✅ Test user already exists: ${SAMPLE_USER.name} (ID: ${userCheck.rows[0].id})`, 'yellow');
            return userCheck.rows[0].id;
        }
    } catch (error) {
        log(`❌ Error creating test user: ${error.message}`, 'red');
        throw error;
    }
}

async function createDemoData() {
    try {
        separator('Creating Demo Data');
        
        // Create test user first
        const userId = await createTestUser();
        
        // Clear existing demo data for this user
        await pool.query('DELETE FROM ledger_entries WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM order_items WHERE user_id = $1', [userId]);
        
        log('\n📊 Inserting sample transactions...', 'blue');
        
        for (const [index, transaction] of SAMPLE_TRANSACTIONS.entries()) {
            // Insert ledger entry (transaction)
            const ledgerResult = await pool.query(
                `INSERT INTO ledger_entries (user_id, merchant, transaction_date, total_amount, transaction_type, created_at) 
                 VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
                [userId, transaction.merchant, transaction.transaction_date, transaction.total_amount, 'expense']
            );
            
            const ledgerEntryId = ledgerResult.rows[0].id;
            
            // Insert line items as order_items (using the product names)
            for (const item of transaction.line_items) {
                // Check if order_item already exists for this user and product
                const existingItem = await pool.query(
                    'SELECT id, qty FROM order_items WHERE user_id = $1 AND name = $2',
                    [userId, item.product_name]
                );
                
                if (existingItem.rows.length > 0) {
                    // Update existing item quantity
                    await pool.query(
                        'UPDATE order_items SET qty = qty + $1, updated_at = NOW() WHERE id = $2',
                        [item.quantity, existingItem.rows[0].id]
                    );
                } else {
                    // Insert new order item
                    await pool.query(
                        `INSERT INTO order_items (user_id, name, qty, unit, reason, created_at) 
                         VALUES ($1, $2, $3, $4, $5, NOW())`,
                        [userId, item.product_name, item.quantity, 'units', `From transaction: ${transaction.merchant}`]
                    );
                }
            }
            
            log(`  ✅ Transaction ${index + 1}: ${transaction.merchant} - ₹${transaction.total_amount}`, 'green');
        }
        
        log(`\n🎉 Successfully created ${SAMPLE_TRANSACTIONS.length} sample transactions!`, 'green');
        return userId;
        
    } catch (error) {
        log(`❌ Error creating demo data: ${error.message}`, 'red');
        throw error;
    }
}

async function showTableContents() {
    try {
        separator('RAG Memory System - Table Contents');
        
        // Show shop_memory table
        log('\n🧠 Shop Memory Table:', 'magenta');
        const shopMemory = await pool.query('SELECT * FROM shop_memory ORDER BY created_at DESC LIMIT 5');
        if (shopMemory.rows.length > 0) {
            shopMemory.rows.forEach((row, idx) => {
                log(`  ${idx + 1}. Store: ${row.store_context?.name || 'Unknown'} | Pattern: ${row.pattern_type}`, 'cyan');
                log(`     Learning: ${row.learning_summary?.substring(0, 80)}...`, 'cyan');
                log(`     Confidence: ${row.confidence_score} | Created: ${new Date(row.created_at).toLocaleDateString()}`, 'cyan');
                log('', 'reset');
            });
        } else {
            log('     No data found', 'yellow');
        }
        
        // Show product_relationships table
        log('\n🔗 Product Relationships Table:', 'magenta');
        const relationships = await pool.query('SELECT * FROM product_relationships ORDER BY correlation_score DESC LIMIT 5');
        if (relationships.rows.length > 0) {
            relationships.rows.forEach((row, idx) => {
                log(`  ${idx + 1}. ${row.product_a} ↔ ${row.product_b} (Score: ${row.correlation_score})`, 'cyan');
                log(`     Context: ${row.context_metadata?.reason || 'N/A'}`, 'cyan');
                log('', 'reset');
            });
        } else {
            log('     No data found', 'yellow');
        }
        
        // Show experience_insights table
        log('\n💡 Experience Insights Table:', 'magenta');
        const insights = await pool.query('SELECT * FROM experience_insights ORDER BY created_at DESC LIMIT 3');
        if (insights.rows.length > 0) {
            insights.rows.forEach((row, idx) => {
                log(`  ${idx + 1}. Store: ${row.store_context?.name || 'Unknown'} | Type: ${row.insight_type}`, 'cyan');
                log(`     Key Insight: ${row.key_insights?.main_finding?.substring(0, 60)}...`, 'cyan');
                log(`     Impact: ${row.business_impact?.revenue_potential || 'Unknown'}`, 'cyan');
                log('', 'reset');
            });
        } else {
            log('     No data found', 'yellow');
        }
        
        // Show summary statistics
        const counts = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM shop_memory) as memory_count,
                (SELECT COUNT(*) FROM product_relationships) as relationships_count,
                (SELECT COUNT(*) FROM experience_insights) as insights_count,
                (SELECT COUNT(*) FROM ledger_entries WHERE user_id IN (SELECT id FROM users WHERE name = $1)) as ledger_count,
                (SELECT COUNT(*) FROM order_items WHERE user_id IN (SELECT id FROM users WHERE name = $1)) as items_count
        `, [SAMPLE_USER.name]);
        
        log('\n📈 System Statistics:', 'yellow');
        const stats = counts.rows[0];
        log(`  • Memory Records: ${stats.memory_count}`, 'cyan');
        log(`  • Product Relationships: ${stats.relationships_count}`, 'cyan');
        log(`  • Experience Insights: ${stats.insights_count}`, 'cyan');
        log(`  • Demo Ledger Entries: ${stats.ledger_count}`, 'cyan');
        log(`  • Demo Order Items: ${stats.items_count}`, 'cyan');
        
    } catch (error) {
        log(`❌ Error showing table contents: ${error.message}`, 'red');
        throw error;
    }
}

async function demonstrateAPI() {
    try {
        separator('RAG Memory System - AI Demonstrations');
        
        // Get user ID
        const userResult = await pool.query('SELECT id FROM users WHERE name = $1', [SAMPLE_USER.name]);
        const userId = userResult.rows[0].id;
        
        // 1. Memory-based recommendations
        log('\n🤖 1. Memory-Based Recommendations:', 'blue');
        try {
            const recommendations = await generateMemoryBasedRecommendations(userId, SAMPLE_STORE);
            log('   Recommendations:', 'green');
            recommendations.forEach((rec, idx) => {
                log(`     ${idx + 1}. ${rec.product || rec.item} - ${rec.reason}`, 'cyan');
            });
        } catch (error) {
            log(`     ⚠️  Service not available: ${error.message}`, 'yellow');
        }
        
        // 2. Sales expansion guidance
        log('\n📈 2. Sales Expansion Guidance:', 'blue');
        try {
            const expansion = await generateSalesExpansionGuidance(userId, SAMPLE_STORE);
            log('   Expansion Strategy:', 'green');
            if (expansion.opportunities) {
                expansion.opportunities.forEach((opp, idx) => {
                    log(`     ${idx + 1}. ${opp.category}: ${opp.suggestion}`, 'cyan');
                });
            } else {
                log(`     Strategy: ${expansion.strategy || expansion}`, 'cyan');
            }
        } catch (error) {
            log(`     ⚠️  Service not available: ${error.message}`, 'yellow');
        }
        
        // 3. Experience guidance
        log('\n✨ 3. Experience Guidance:', 'blue');
        try {
            const experience = await generateExperienceGuidance(userId, SAMPLE_STORE);
            log('   Experience Insights:', 'green');
            if (experience.insights) {
                experience.insights.forEach((insight, idx) => {
                    log(`     ${idx + 1}. ${insight.area}: ${insight.recommendation}`, 'cyan');
                });
            } else {
                log(`     Guidance: ${experience.guidance || experience}`, 'cyan');
            }
        } catch (error) {
            log(`     ⚠️  Service not available: ${error.message}`, 'yellow');
        }
        
    } catch (error) {
        log(`❌ Error demonstrating APIs: ${error.message}`, 'red');
        throw error;
    }
}

async function runDemo() {
    try {
        log('🚀 Starting RAG Memory System Demo...', 'bright');
        log('This demo will show you how the AI learns from transaction data\n', 'cyan');
        
        // Step 1: Create demo data
        const userId = await createDemoData();
        
        // Step 2: Initialize the memory system
        separator('Initializing RAG Memory System');
        log('🧠 Training AI on transaction patterns...', 'blue');
        await initializeStoreMemory(userId, SAMPLE_STORE);
        
        // Check memory health
        const health = await checkMemoryHealth(userId, SAMPLE_STORE);
        log(`✅ Memory system health: ${health.status}`, health.status === 'healthy' ? 'green' : 'yellow');
        
        // Step 3: Show what the system learned
        await showTableContents();
        
        // Step 4: Demonstrate AI capabilities
        await demonstrateAPI();
        
        separator('Demo Complete');
        log('🎉 RAG Memory System demo completed successfully!', 'green');
        log('\nWhat happened:', 'bright');
        log('1. ✅ Created sample transaction data', 'cyan');
        log('2. ✅ AI analyzed patterns and relationships', 'cyan');
        log('3. ✅ System learned customer preferences', 'cyan');
        log('4. ✅ Generated intelligent recommendations', 'cyan');
        log('\n💡 The system now has memory of customer patterns and can provide smart suggestions!', 'yellow');
        
    } catch (error) {
        log(`\n💥 Demo failed: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await pool.end();
    }
}

// Run the demo if this file is executed directly
if (require.main === module) {
    runDemo();
}

module.exports = {
    runDemo,
    createDemoData,
    showTableContents,
    demonstrateAPI,
    SAMPLE_STORE,
    SAMPLE_USER,
    SAMPLE_TRANSACTIONS
};