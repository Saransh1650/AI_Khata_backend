'use strict';
/**
 * RAG Memory System Test & Demo Script
 * ────────────────────────────────────────
 *
 * This script demonstrates the complete RAG memory system with sample data.
 * Use it to understand how the system learns and what data looks like in tables.
 *
 * Run: node src/test/ragDemo.js
 */
require('dotenv').config();
const pool = require('../config/database');
const { initializeStoreMemory, checkMemoryHealth } = require('../ai/transactionLearner');
const { generateMemoryBasedRecommendations } = require('../ai/shopMemory');
const { generateSalesExpansionGuidance } = require('../ai/relationshipIntelligence');
const { generateExperienceGuidance } = require('../ai/experienceEngine');

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
            { product_name: 'Biscuits', quantity: 1, unit_price: 50.0 }
        ]
    },

    // Week 2 - Patterns emerge (same products together)
    {
        merchant: 'Customer D',
        transaction_date: '2026-02-08 11:20:00',
        total_amount: 125.5,
        line_items: [
            { product_name: 'Milk', quantity: 1, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 2, unit_price: 20.0 },
            { product_name: 'Butter', quantity: 1, unit_price: 60.5 }
        ]
    },
    {
        merchant: 'Customer E',
        transaction_date: '2026-02-09 16:30:00',
        total_amount: 175.0,
        line_items: [
            { product_name: 'Tea', quantity: 2, unit_price: 45.0 },
            { product_name: 'Biscuits', quantity: 1, unit_price: 50.0 },
            { product_name: 'Sugar', quantity: 1, unit_price: 35.0 }
        ]
    },

    // Week 3 - More relationship patterns
    {
        merchant: 'Customer F',
        transaction_date: '2026-02-15 08:30:00',
        total_amount: 310.0,
        line_items: [
            { product_name: 'Rice', quantity: 1, unit_price: 150.0 },
            { product_name: 'Oil', quantity: 1, unit_price: 130.0 },
            { product_name: 'Onions', quantity: 1, unit_price: 30.0 }
        ]
    },
    {
        merchant: 'Customer A',
        transaction_date: '2026-02-16 12:15:00',
        total_amount: 145.5,
        line_items: [
            { product_name: 'Milk', quantity: 2, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 1, unit_price: 20.0 },
            { product_name: 'Butter', quantity: 1, unit_price: 75.5 }
        ]
    },

    // Festival season (Holi preparation)
    {
        merchant: 'Customer G',
        transaction_date: '2026-02-20 10:00:00', // Before Holi
        total_amount: 425.0,
        line_items: [
            { product_name: 'Milk', quantity: 3, unit_price: 25.0 },
            { product_name: 'Sugar', quantity: 2, unit_price: 35.0 },
            { product_name: 'Ghee', quantity: 1, unit_price: 180.0 },
            { product_name: 'Sweets', quantity: 1, unit_price: 150.0 }
        ]
    },
    {
        merchant: 'Customer H',
        transaction_date: '2026-02-21 15:30:00',
        total_amount: 320.0,
        line_items: [
            { product_name: 'Colors', quantity: 1, unit_price: 80.0 },
            { product_name: 'Milk', quantity: 4, unit_price: 25.0 },
            { product_name: 'Sugar', quantity: 3, unit_price: 35.0 },
            { product_name: 'Snacks', quantity: 1, unit_price: 95.0 }
        ]
    },

    // More regular patterns to strengthen memory
    ...Array.from({ length: 15 }, (_, i) => ({
        merchant: `Customer ${String.fromCharCode(73 + i)}`, // Customer I, J, K...
        transaction_date: `2026-02-${22 + (i % 6)} ${(9 + (i % 12)).toString().padStart(2, '0')}:${(i * 7) % 60}:00`,
        total_amount: Math.round((Math.random() * 200 + 100) * 100) / 100,
        line_items: [
            // Random but realistic combinations
            ...(Math.random() > 0.4 ? [{ product_name: 'Milk', quantity: Math.ceil(Math.random() * 3), unit_price: 25.0 }] : []),
            ...(Math.random() > 0.6 ? [{ product_name: 'Bread', quantity: 1, unit_price: 20.0 }] : []),
            ...(Math.random() > 0.7 ? [{ product_name: 'Tea', quantity: 1, unit_price: 45.0 }] : []),
            ...(Math.random() > 0.8 ? [{ product_name: 'Rice', quantity: 1, unit_price: 150.0 }] : []),
            ...(Math.random() > 0.5 ? [{ product_name: 'Biscuits', quantity: 1, unit_price: 50.0 }] : []),
        ].filter(item => item.product_name) // Remove empty items
    }))
];

// ── Demo Functions ─────────────────────────────────────────────────────────

async function createDemoData() {
    console.log('🔧 Setting up demo data...');

    // Create demo user
    const userResult = await pool.query(
        'INSERT INTO users (name, password_hash) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [SAMPLE_USER.name, 'hashed_password_demo']
    );
    const userId = userResult.rows[0].id;

    // Create demo store
    const storeResult = await pool.query(
        'INSERT INTO stores (user_id, name, region, type) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, SAMPLE_STORE.name, SAMPLE_STORE.region, SAMPLE_STORE.type]
    );
    const storeId = storeResult.rows[0].id;

    console.log(`✅ Created demo store: ${storeId}`);

    // Insert sample transactions
    for (const [index, transaction] of SAMPLE_TRANSACTIONS.entries()) {
        const ledgerResult = await pool.query(
            'INSERT INTO ledger_entries (user_id, store_id, merchant, transaction_date, total_amount) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [userId, storeId, transaction.merchant, transaction.transaction_date, transaction.total_amount]
        );
        const ledgerEntryId = ledgerResult.rows[0].id;

        // Insert line items
        for (const item of transaction.line_items) {
            await pool.query(
                'INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)',
                [ledgerEntryId, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price]
            );
        }

        if ((index + 1) % 5 === 0) {
            console.log(`📝 Inserted ${index + 1}/${SAMPLE_TRANSACTIONS.length} transactions`);
        }
    }

    console.log(`✅ Created ${SAMPLE_TRANSACTIONS.length} sample transactions\n`);
    return { userId, storeId };
}

async function showTableContents(storeId, title) {
    console.log(`\n📊 ${title}`);
    console.log('━'.repeat(80));

    // Show shop_memory
    const memoryResult = await pool.query(
        'SELECT memory_type, context, memory_data, confidence, frequency FROM shop_memory WHERE store_id = $1 ORDER BY confidence DESC',
        [storeId]
    );

    if (memoryResult.rows.length > 0) {
        console.log('\n🧠 SHOP MEMORY:');
        console.log('Type'.padEnd(20), 'Context'.padEnd(15), 'Confidence'.padEnd(12), 'Frequency'.padEnd(10), 'Data Sample');
        console.log('-'.repeat(80));

        for (const row of memoryResult.rows.slice(0, 10)) {
            const dataSample = JSON.stringify(row.memory_data).substring(0, 30) + '...';
            console.log(
                row.memory_type.padEnd(20),
                row.context.padEnd(15),
                row.confidence.toString().padEnd(12),
                row.frequency.toString().padEnd(10),
                dataSample
            );
        }
    }

    // Show product_relationships
    const relationshipResult = await pool.query(
        'SELECT product_a, product_b, relationship_type, strength, occurrences FROM product_relationships WHERE store_id = $1 ORDER BY strength DESC',
        [storeId]
    );

    if (relationshipResult.rows.length > 0) {
        console.log('\n🔗 PRODUCT RELATIONSHIPS:');
        console.log('Product A'.padEnd(15), 'Product B'.padEnd(15), 'Type'.padEnd(20), 'Strength'.padEnd(10), 'Count');
        console.log('-'.repeat(80));

        for (const row of relationshipResult.rows.slice(0, 10)) {
            console.log(
                row.product_a.padEnd(15),
                row.product_b.padEnd(15),
                row.relationship_type.padEnd(20),
                row.strength.toString().padEnd(10),
                row.occurrences.toString()
            );
        }
    }

    // Show experience_insights
    const insightResult = await pool.query(
        'SELECT insight_category, title, confidence FROM experience_insights WHERE store_id = $1 ORDER BY confidence DESC',
        [storeId]
    );

    if (insightResult.rows.length > 0) {
        console.log('\n💡 EXPERIENCE INSIGHTS:');
        console.log('Category'.padEnd(20), 'Title'.padEnd(40), 'Confidence');
        console.log('-'.repeat(80));

        for (const row of insightResult.rows) {
            console.log(
                row.insight_category.padEnd(20),
                row.title.padEnd(40),
                row.confidence.toString()
            );
        }
    }
}

async function demonstrateAPI(userId, storeId) {
    console.log('\n🚀 RAG API DEMONSTRATION');
    console.log('━'.repeat(80));

    // Sample inventory for context
    const sampleInventory = [
        { product: 'Milk', quantity: 12, unit: 'liters' },
        { product: 'Bread', quantity: 8, unit: 'loaves' },
        { product: 'Rice', quantity: 5, unit: 'kg' },
        { product: 'Tea', quantity: 15, unit: 'packets' },
        { product: 'Oil', quantity: 3, unit: 'liters' },
        { product: 'Sugar', quantity: 20, unit: 'kg' }
    ];

    console.log('\n📦 CURRENT INVENTORY:');
    console.log(JSON.stringify(sampleInventory, null, 2));

    // Memory-based recommendations
    console.log('\n🎯 MEMORY-BASED RECOMMENDATIONS:');
    try {
        const recommendations = await generateMemoryBasedRecommendations(storeId, sampleInventory);
        console.log(JSON.stringify(recommendations, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }

    // Sales expansion guidance
    console.log('\n💰 SALES EXPANSION GUIDANCE:');
    try {
        const expansionGuidance = await generateSalesExpansionGuidance(storeId, sampleInventory);
        console.log(JSON.stringify(expansionGuidance, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }

    // Experience-driven guidance (if enough data)
    console.log('\n🧠 EXPERIENCE-DRIVEN GUIDANCE:');
    try {
        const input = {
            storeType: 'grocery',
            todayDate: '2026-03-02',
            inventory: sampleInventory,
            recentSales: [
                { product: 'Milk', trend: 'rising' },
                { product: 'Bread', trend: 'stable' },
                { product: 'Tea', trend: 'rising' }
            ],
            shopActivity: {
                recentBusiness: 'growing',
                busyDays: ['Monday', 'Saturday', 'Sunday']
            },
            upcomingFestival: {
                name: 'Holi',
                daysAway: 8
            }
        };

        const experienceGuidance = await generateExperienceGuidance(storeId, 'grocery', input);
        console.log(JSON.stringify(experienceGuidance, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }
}

// ── Main Demo Runner ───────────────────────────────────────────────────────

async function runDemo() {
    console.log('🎭 RAG MEMORY SYSTEM DEMO');
    console.log('━'.repeat(80));
    console.log('This demo shows how the RAG system learns from transactions');
    console.log('and builds shop intelligence over time.\n');

    try {
        // Step 1: Create sample data
        const { userId, storeId } = await createDemoData();

        // Step 2: Show empty state
        await showTableContents(storeId, 'INITIAL STATE (No Memory Yet)');

        // Step 3: Initialize RAG memory
        console.log('\n🤖 Initializing RAG memory system...');
        const initResult = await initializeStoreMemory(userId, storeId, 90);
        console.log('Initialization result:', JSON.stringify(initResult, null, 2));

        // Step 4: Show learned memory
        await showTableContents(storeId, 'AFTER RAG LEARNING');

        // Step 5: Check memory health
        console.log('\n🏥 MEMORY HEALTH CHECK:');
        const healthCheck = await checkMemoryHealth(storeId);
        console.log(JSON.stringify(healthCheck, null, 2));

        // Step 6: Demonstrate API responses
        await demonstrateAPI(userId, storeId);

        console.log('\n✅ Demo completed successfully!');
        console.log('\n📚 KEY TAKEAWAYS:');
        console.log('1. RAG system learns product behaviors and relationships from transactions');
        console.log('2. Memory strength improves with more transaction data');
        console.log('3. Recommendations are based on shop-specific patterns, not generic rules');
        console.log('4. Product relationships drive sales expansion opportunities');
        console.log('5. Festival guidance uses historical shop behavior, not generic suggestions\n');

    } catch (error) {
        console.error('❌ Demo failed:', error);
    } finally {
        await pool.end();
    }
}

// Run the demo if called directly
if (require.main === module) {
    runDemo();
}

module.exports = {
    runDemo,
    createDemoData,
    showTableContents,
    demonstrateAPI
};
'use strict';
/**
 * RAG Memory System Test & Demo Script
 * ────────────────────────────────────────
 *
 * This script demonstrates the complete RAG memory system with sample data.
 * Use it to understand how the system learns and what data looks like in tables.
 *
 * Run: node src/test/ragDemo.js
 */
require('dotenv').config();
const pool = require('../config/database');
const { initializeStoreMemory, checkMemoryHealth } = require('../ai/transactionLearner');
const { generateMemoryBasedRecommendations } = require('../ai/shopMemory');
const { generateSalesExpansionGuidance } = require('../ai/relationshipIntelligence');
const { generateExperienceGuidance } = require('../ai/experienceEngine');

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
            { product_name: 'Biscuits', quantity: 1, unit_price: 50.0 }
        ]
    },

    // Week 2 - Patterns emerge (same products together)
    {
        merchant: 'Customer D',
        transaction_date: '2026-02-08 11:20:00',
        total_amount: 125.5,
        line_items: [
            { product_name: 'Milk', quantity: 1, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 2, unit_price: 20.0 },
            { product_name: 'Butter', quantity: 1, unit_price: 60.5 }
        ]
    },
    {
        merchant: 'Customer E',
        transaction_date: '2026-02-09 16:30:00',
        total_amount: 175.0,
        line_items: [
            { product_name: 'Tea', quantity: 2, unit_price: 45.0 },
            { product_name: 'Biscuits', quantity: 1, unit_price: 50.0 },
            { product_name: 'Sugar', quantity: 1, unit_price: 35.0 }
        ]
    },

    // Week 3 - More relationship patterns
    {
        merchant: 'Customer F',
        transaction_date: '2026-02-15 08:30:00',
        total_amount: 310.0,
        line_items: [
            { product_name: 'Rice', quantity: 1, unit_price: 150.0 },
            { product_name: 'Oil', quantity: 1, unit_price: 130.0 },
            { product_name: 'Onions', quantity: 1, unit_price: 30.0 }
        ]
    },
    {
        merchant: 'Customer A',
        transaction_date: '2026-02-16 12:15:00',
        total_amount: 145.5,
        line_items: [
            { product_name: 'Milk', quantity: 2, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 1, unit_price: 20.0 },
            { product_name: 'Butter', quantity: 1, unit_price: 75.5 }
        ]
    },

    // Festival season (Holi preparation)
    {
        merchant: 'Customer G',
        transaction_date: '2026-02-20 10:00:00', // Before Holi
        total_amount: 425.0,
        line_items: [
            { product_name: 'Milk', quantity: 3, unit_price: 25.0 },
            { product_name: 'Sugar', quantity: 2, unit_price: 35.0 },
            { product_name: 'Ghee', quantity: 1, unit_price: 180.0 },
            { product_name: 'Sweets', quantity: 1, unit_price: 150.0 }
        ]
    },
    {
        merchant: 'Customer H',
        transaction_date: '2026-02-21 15:30:00',
        total_amount: 320.0,
        line_items: [
            { product_name: 'Colors', quantity: 1, unit_price: 80.0 },
            { product_name: 'Milk', quantity: 4, unit_price: 25.0 },
            { product_name: 'Sugar', quantity: 3, unit_price: 35.0 },
            { product_name: 'Snacks', quantity: 1, unit_price: 95.0 }
        ]
    },

    // More regular patterns to strengthen memory
    ...Array.from({ length: 15 }, (_, i) => ({
        merchant: `Customer ${String.fromCharCode(73 + i)}`, // Customer I, J, K...
        transaction_date: `2026-02-${22 + (i % 6)} ${(9 + (i % 12)).toString().padStart(2, '0')}:${(i * 7) % 60}:00`,
        total_amount: Math.round((Math.random() * 200 + 100) * 100) / 100,
        line_items: [
            // Random but realistic combinations
            ...(Math.random() > 0.4 ? [{ product_name: 'Milk', quantity: Math.ceil(Math.random() * 3), unit_price: 25.0 }] : []),
            ...(Math.random() > 0.6 ? [{ product_name: 'Bread', quantity: 1, unit_price: 20.0 }] : []),
            ...(Math.random() > 0.7 ? [{ product_name: 'Tea', quantity: 1, unit_price: 45.0 }] : []),
            ...(Math.random() > 0.8 ? [{ product_name: 'Rice', quantity: 1, unit_price: 150.0 }] : []),
            ...(Math.random() > 0.5 ? [{ product_name: 'Biscuits', quantity: 1, unit_price: 50.0 }] : []),
        ].filter(item => item.product_name) // Remove empty items
    }))
];

// ── Demo Functions ─────────────────────────────────────────────────────────

async function createDemoData() {
    console.log('🔧 Setting up demo data...');

    // Create demo user
    const userResult = await pool.query(
        'INSERT INTO users (name, password_hash) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [SAMPLE_USER.name, 'hashed_password_demo']
    );
    const userId = userResult.rows[0].id;

    // Create demo store
    const storeResult = await pool.query(
        'INSERT INTO stores (user_id, name, region, type) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, SAMPLE_STORE.name, SAMPLE_STORE.region, SAMPLE_STORE.type]
    );
    const storeId = storeResult.rows[0].id;

    console.log(`✅ Created demo store: ${storeId}`);

    // Insert sample transactions
    for (const [index, transaction] of SAMPLE_TRANSACTIONS.entries()) {
        const ledgerResult = await pool.query(
            'INSERT INTO ledger_entries (user_id, store_id, merchant, transaction_date, total_amount) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [userId, storeId, transaction.merchant, transaction.transaction_date, transaction.total_amount]
        );
        const ledgerEntryId = ledgerResult.rows[0].id;

        // Insert line items
        for (const item of transaction.line_items) {
            await pool.query(
                'INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)',
                [ledgerEntryId, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price]
            );
        }

        if ((index + 1) % 5 === 0) {
            console.log(`📝 Inserted ${index + 1}/${SAMPLE_TRANSACTIONS.length} transactions`);
        }
    }

    console.log(`✅ Created ${SAMPLE_TRANSACTIONS.length} sample transactions\n`);
    return { userId, storeId };
}

async function showTableContents(storeId, title) {
    console.log(`\n📊 ${title}`);
    console.log('━'.repeat(80));

    // Show shop_memory
    const memoryResult = await pool.query(
        'SELECT memory_type, context, memory_data, confidence, frequency FROM shop_memory WHERE store_id = $1 ORDER BY confidence DESC',
        [storeId]
    );

    if (memoryResult.rows.length > 0) {
        console.log('\n🧠 SHOP MEMORY:');
        console.log('Type'.padEnd(20), 'Context'.padEnd(15), 'Confidence'.padEnd(12), 'Frequency'.padEnd(10), 'Data Sample');
        console.log('-'.repeat(80));

        for (const row of memoryResult.rows.slice(0, 10)) {
            const dataSample = JSON.stringify(row.memory_data).substring(0, 30) + '...';
            console.log(
                row.memory_type.padEnd(20),
                row.context.padEnd(15),
                row.confidence.toString().padEnd(12),
                row.frequency.toString().padEnd(10),
                dataSample
            );
        }
    }

    // Show product_relationships
    const relationshipResult = await pool.query(
        'SELECT product_a, product_b, relationship_type, strength, occurrences FROM product_relationships WHERE store_id = $1 ORDER BY strength DESC',
        [storeId]
    );

    if (relationshipResult.rows.length > 0) {
        console.log('\n🔗 PRODUCT RELATIONSHIPS:');
        console.log('Product A'.padEnd(15), 'Product B'.padEnd(15), 'Type'.padEnd(20), 'Strength'.padEnd(10), 'Count');
        console.log('-'.repeat(80));

        for (const row of relationshipResult.rows.slice(0, 10)) {
            console.log(
                row.product_a.padEnd(15),
                row.product_b.padEnd(15),
                row.relationship_type.padEnd(20),
                row.strength.toString().padEnd(10),
                row.occurrences.toString()
            );
        }
    }

    // Show experience_insights
    const insightResult = await pool.query(
        'SELECT insight_category, title, confidence FROM experience_insights WHERE store_id = $1 ORDER BY confidence DESC',
        [storeId]
    );

    if (insightResult.rows.length > 0) {
        console.log('\n💡 EXPERIENCE INSIGHTS:');
        console.log('Category'.padEnd(20), 'Title'.padEnd(40), 'Confidence');
        console.log('-'.repeat(80));

        for (const row of insightResult.rows) {
            console.log(
                row.insight_category.padEnd(20),
                row.title.padEnd(40),
                row.confidence.toString()
            );
        }
    }
}

async function demonstrateAPI(userId, storeId) {
    console.log('\n🚀 RAG API DEMONSTRATION');
    console.log('━'.repeat(80));

    // Sample inventory for context
    const sampleInventory = [
        { product: 'Milk', quantity: 12, unit: 'liters' },
        { product: 'Bread', quantity: 8, unit: 'loaves' },
        { product: 'Rice', quantity: 5, unit: 'kg' },
        { product: 'Tea', quantity: 15, unit: 'packets' },
        { product: 'Oil', quantity: 3, unit: 'liters' },
        { product: 'Sugar', quantity: 20, unit: 'kg' }
    ];

    console.log('\n📦 CURRENT INVENTORY:');
    console.log(JSON.stringify(sampleInventory, null, 2));

    // Memory-based recommendations
    console.log('\n🎯 MEMORY-BASED RECOMMENDATIONS:');
    try {
        const recommendations = await generateMemoryBasedRecommendations(storeId, sampleInventory);
        console.log(JSON.stringify(recommendations, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }

    // Sales expansion guidance
    console.log('\n💰 SALES EXPANSION GUIDANCE:');
    try {
        const expansionGuidance = await generateSalesExpansionGuidance(storeId, sampleInventory);
        console.log(JSON.stringify(expansionGuidance, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }

    // Experience-driven guidance (if enough data)
    console.log('\n🧠 EXPERIENCE-DRIVEN GUIDANCE:');
    try {
        const input = {
            storeType: 'grocery',
            todayDate: '2026-03-02',
            inventory: sampleInventory,
            recentSales: [
                { product: 'Milk', trend: 'rising' },
                { product: 'Bread', trend: 'stable' },
                { product: 'Tea', trend: 'rising' }
            ],
            shopActivity: {
                recentBusiness: 'growing',
                busyDays: ['Monday', 'Saturday', 'Sunday']
            },
            upcomingFestival: {
                name: 'Holi',
                daysAway: 8
            }
        };

        const experienceGuidance = await generateExperienceGuidance(storeId, 'grocery', input);
        console.log(JSON.stringify(experienceGuidance, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }
}

// ── Main Demo Runner ───────────────────────────────────────────────────────

async function runDemo() {
    console.log('🎭 RAG MEMORY SYSTEM DEMO');
    console.log('━'.repeat(80));
    console.log('This demo shows how the RAG system learns from transactions');
    console.log('and builds shop intelligence over time.\n');

    try {
        // Step 1: Create sample data
        const { userId, storeId } = await createDemoData();

        // Step 2: Show empty state
        await showTableContents(storeId, 'INITIAL STATE (No Memory Yet)');

        // Step 3: Initialize RAG memory
        console.log('\n🤖 Initializing RAG memory system...');
        const initResult = await initializeStoreMemory(userId, storeId, 90);
        console.log('Initialization result:', JSON.stringify(initResult, null, 2));

        // Step 4: Show learned memory
        await showTableContents(storeId, 'AFTER RAG LEARNING');

        // Step 5: Check memory health
        console.log('\n🏥 MEMORY HEALTH CHECK:');
        const healthCheck = await checkMemoryHealth(storeId);
        console.log(JSON.stringify(healthCheck, null, 2));

        // Step 6: Demonstrate API responses
        await demonstrateAPI(userId, storeId);

        console.log('\n✅ Demo completed successfully!');
        console.log('\n📚 KEY TAKEAWAYS:');
        console.log('1. RAG system learns product behaviors and relationships from transactions');
        console.log('2. Memory strength improves with more transaction data');
        console.log('3. Recommendations are based on shop-specific patterns, not generic rules');
        console.log('4. Product relationships drive sales expansion opportunities');
        console.log('5. Festival guidance uses historical shop behavior, not generic suggestions\n');

    } catch (error) {
        console.error('❌ Demo failed:', error);
    } finally {
        await pool.end();
    }
}

// Run the demo if called directly
if (require.main === module) {
    runDemo();
}

module.exports = {
    runDemo,
    createDemoData,
    showTableContents,
    demonstrateAPI
};
'use strict';
/**
 * RAG Memory System Test & Demo Script
 * ────────────────────────────────────────
 *
 * This script demonstrates the complete RAG memory system with sample data.
 * Use it to understand how the system learns and what data looks like in tables.
 *
 * Run: node src/test/ragDemo.js
 */
require('dotenv').config();
const pool = require('../config/database');
const { initializeStoreMemory, checkMemoryHealth } = require('../ai/transactionLearner');
const { generateMemoryBasedRecommendations } = require('../ai/shopMemory');
const { generateSalesExpansionGuidance } = require('../ai/relationshipIntelligence');
const { generateExperienceGuidance } = require('../ai/experienceEngine');

// Sample data for demonstration
const SAMPLE_STORE = {
    name: 'Sharma General Store',
    type: 'grocery',
    region: 'Mumbai'
};

const SAMPLE_USER = {
    name: 'testuser_rag_demo',
    password: 'demo123'
    'use strict';
    /**
     * RAG Memory System Test & Demo Script
     * ────────────────────────────────────────
     *
     * This script demonstrates the complete RAG memory system with sample data.
     * Use it to understand how the system learns and what data looks like in tables.
     *
     * Run: node src/test/ragDemo.js
     */
    require('dotenv').config();
    const pool = require('../config/database');
    const { initializeStoreMemory, checkMemoryHealth } = require('../ai/transactionLearner');
    const { generateMemoryBasedRecommendations } = require('../ai/shopMemory');
    const { generateSalesExpansionGuidance } = require('../ai/relationshipIntelligence');
    const { generateExperienceGuidance } = require('../ai/experienceEngine');
 
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
            total_amount: 145.50,
            line_items: [
                { product_name: 'Milk', quantity: 2, unit_price: 25.00 },
                { product_name: 'Bread', quantity: 1, unit_price: 20.00 },
                { product_name: 'Butter', quantity: 1, unit_price: 80.50 }
            ]
        },
        {
            merchant: 'Customer B',
            transaction_date: '2026-02-01 14:15:00',
            total_amount: 280.00,
            line_items: [
                { product_name: 'Rice', quantity: 1, unit_price: 150.00 },
                { product_name: 'Oil', quantity: 1, unit_price: 130.00 }
            ]
        },
        {
            merchant: 'Customer C',
            transaction_date: '2026-02-02 09:45:00',
            total_amount: 95.00,
            line_items: [
                { product_name: 'Tea', quantity: 1, unit_price: 45.00 },
                { product_name: 'Biscuits', quantity: 1, unit_price: 50.00 }
            ]
        },
    
        // Week 2 - Patterns emerge (same products together)
        {
            merchant: 'Customer D',
            transaction_date: '2026-02-08 11:20:00',
            total_amount: 125.50,
            line_items: [
                { product_name: 'Milk', quantity: 1, unit_price: 25.00 },
                { product_name: 'Bread', quantity: 2, unit_price: 20.00 },
                { product_name: 'Butter', quantity: 1, unit_price: 60.50 }
            ]
        },
        {
            merchant: 'Customer E',
            transaction_date: '2026-02-09 16:30:00',
            total_amount: 175.00,
            line_items: [
                { product_name: 'Tea', quantity: 2, unit_price: 45.00 },
                { product_name: 'Biscuits', quantity: 1, unit_price: 50.00 },
                { product_name: 'Sugar', quantity: 1, unit_price: 35.00 }
            ]
        },
    
        // Week 3 - More relationship patterns
        {
            merchant: 'Customer F',
            transaction_date: '2026-02-15 08:30:00',
            total_amount: 310.00,
            line_items: [
                { product_name: 'Rice', quantity: 1, unit_price: 150.00 },
                { product_name: 'Oil', quantity: 1, unit_price: 130.00 },
                { product_name: 'Onions', quantity: 1, unit_price: 30.00 }
            ]
        },
        {
            merchant: 'Customer A',
            transaction_date: '2026-02-16 12:15:00',
            total_amount: 145.50,
            line_items: [
                { product_name: 'Milk', quantity: 2, unit_price: 25.00 },
                { product_name: 'Bread', quantity: 1, unit_price: 20.00 },
                { product_name: 'Butter', quantity: 1, unit_price: 75.50 }
            ]
        },
    
        // Festival season (Holi preparation)
        {
            merchant: 'Customer G',
            transaction_date: '2026-02-20 10:00:00', // Before Holi
            total_amount: 425.00,
            line_items: [
                { product_name: 'Milk', quantity: 3, unit_price: 25.00 },
                { product_name: 'Sugar', quantity: 2, unit_price: 35.00 },
                { product_name: 'Ghee', quantity: 1, unit_price: 180.00 },
                { product_name: 'Sweets', quantity: 1, unit_price: 150.00 }
            ]
        },
        {
            merchant: 'Customer H',
            transaction_date: '2026-02-21 15:30:00',
            total_amount: 320.00,
            line_items: [
                { product_name: 'Colors', quantity: 1, unit_price: 80.00 },
                { product_name: 'Milk', quantity: 4, unit_price: 25.00 },
                { product_name: 'Sugar', quantity: 3, unit_price: 35.00 },
                { product_name: 'Snacks', quantity: 1, unit_price: 95.00 }
            ]
        },
    
        // More regular patterns to strengthen memory
        ...Array.from({ length: 15 }, (_, i) => ({
            merchant: `Customer ${String.fromCharCode(73 + i)}`, // Customer I, J, K...
            transaction_date: `2026-02-${22 + (i % 6)} ${(9 + (i % 12)).toString().padStart(2, '0')}:${(i * 7) % 60}:00`,
            total_amount: Math.round((Math.random() * 200 + 100) * 100) / 100,
            line_items: [
                // Random but realistic combinations
                ...(Math.random() > 0.4 ? [{ product_name: 'Milk', quantity: Math.ceil(Math.random() * 3), unit_price: 25.00 }] : []),
                ...(Math.random() > 0.6 ? [{ product_name: 'Bread', quantity: 1, unit_price: 20.00 }] : []),
                ...(Math.random() > 0.7 ? [{ product_name: 'Tea', quantity: 1, unit_price: 45.00 }] : []),
                ...(Math.random() > 0.8 ? [{ product_name: 'Rice', quantity: 1, unit_price: 150.00 }] : []),
                ...(Math.random() > 0.5 ? [{ product_name: 'Biscuits', quantity: 1, unit_price: 50.00 }] : []),
            ].filter(item => item.product_name) // Remove empty items
        }))
    };
 
    // ── Demo Functions ─────────────────────────────────────────────────────────

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
            { product_name: 'Biscuits', quantity: 1, unit_price: 50.0 }
        ]
    },

    // Week 2 - Patterns emerge (same products together)
    {
        merchant: 'Customer D',
        transaction_date: '2026-02-08 11:20:00',
        total_amount: 125.5,
        line_items: [
            { product_name: 'Milk', quantity: 1, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 2, unit_price: 20.0 },
            { product_name: 'Butter', quantity: 1, unit_price: 60.5 }
        ]
    },
    {
        merchant: 'Customer E',
        transaction_date: '2026-02-09 16:30:00',
        total_amount: 175.0,
        line_items: [
            { product_name: 'Tea', quantity: 2, unit_price: 45.0 },
            { product_name: 'Biscuits', quantity: 1, unit_price: 50.0 },
            { product_name: 'Sugar', quantity: 1, unit_price: 35.0 }
        ]
    },

    // Week 3 - More relationship patterns
    {
        merchant: 'Customer F',
        transaction_date: '2026-02-15 08:30:00',
        total_amount: 310.0,
        line_items: [
            { product_name: 'Rice', quantity: 1, unit_price: 150.0 },
            { product_name: 'Oil', quantity: 1, unit_price: 130.0 },
            { product_name: 'Onions', quantity: 1, unit_price: 30.0 }
        ]
    },
    {
        merchant: 'Customer A',
        transaction_date: '2026-02-16 12:15:00',
        total_amount: 145.5,
        line_items: [
            { product_name: 'Milk', quantity: 2, unit_price: 25.0 },
            { product_name: 'Bread', quantity: 1, unit_price: 20.0 },
            { product_name: 'Butter', quantity: 1, unit_price: 75.5 }
        ]
    },

    // Festival season (Holi preparation)
    {
        merchant: 'Customer G',
        transaction_date: '2026-02-20 10:00:00', // Before Holi
        total_amount: 425.0,
        line_items: [
            { product_name: 'Milk', quantity: 3, unit_price: 25.0 },
            { product_name: 'Sugar', quantity: 2, unit_price: 35.0 },
            { product_name: 'Ghee', quantity: 1, unit_price: 180.0 },
            { product_name: 'Sweets', quantity: 1, unit_price: 150.0 }
        ]
    },
    {
        merchant: 'Customer H',
        transaction_date: '2026-02-21 15:30:00',
        total_amount: 320.0,
        line_items: [
            { product_name: 'Colors', quantity: 1, unit_price: 80.0 },
            { product_name: 'Milk', quantity: 4, unit_price: 25.0 },
            { product_name: 'Sugar', quantity: 3, unit_price: 35.0 },
            { product_name: 'Snacks', quantity: 1, unit_price: 95.0 }
        ]
    },

    // More regular patterns to strengthen memory
    ...Array.from({ length: 15 }, (_, i) => ({
        merchant: `Customer ${String.fromCharCode(73 + i)}`, // Customer I, J, K...
        transaction_date: `2026-02-${22 + (i % 6)} ${(9 + (i % 12)).toString().padStart(2, '0')}:${(i * 7) % 60}:00`,
        total_amount: Math.round((Math.random() * 200 + 100) * 100) / 100,
        line_items: [
            // Random but realistic combinations
            ...(Math.random() > 0.4 ? [{ product_name: 'Milk', quantity: Math.ceil(Math.random() * 3), unit_price: 25.0 }] : []),
            ...(Math.random() > 0.6 ? [{ product_name: 'Bread', quantity: 1, unit_price: 20.0 }] : []),
            ...(Math.random() > 0.7 ? [{ product_name: 'Tea', quantity: 1, unit_price: 45.0 }] : []),
            ...(Math.random() > 0.8 ? [{ product_name: 'Rice', quantity: 1, unit_price: 150.0 }] : []),
            ...(Math.random() > 0.5 ? [{ product_name: 'Biscuits', quantity: 1, unit_price: 50.0 }] : []),
        ].filter(item => item.product_name) // Remove empty items
    }))
];

// ── Demo Functions ─────────────────────────────────────────────────────────

async function createDemoData() {
    console.log('🔧 Setting up demo data...');

    // Create demo user
    const userResult = await pool.query(
        'INSERT INTO users (name, password_hash) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
        [SAMPLE_USER.name, 'hashed_password_demo']
    );
    const userId = userResult.rows[0].id;

    // Create demo store
    const storeResult = await pool.query(
        'INSERT INTO stores (user_id, name, region, type) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, SAMPLE_STORE.name, SAMPLE_STORE.region, SAMPLE_STORE.type]
    );
    const storeId = storeResult.rows[0].id;

    console.log(`✅ Created demo store: ${storeId}`);

    // Insert sample transactions
    for (const [index, transaction] of SAMPLE_TRANSACTIONS.entries()) {
        const ledgerResult = await pool.query(
            'INSERT INTO ledger_entries (user_id, store_id, merchant, transaction_date, total_amount) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [userId, storeId, transaction.merchant, transaction.transaction_date, transaction.total_amount]
        );
        const ledgerEntryId = ledgerResult.rows[0].id;

        // Insert line items
        for (const item of transaction.line_items) {
            await pool.query(
                'INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)',
                [ledgerEntryId, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price]
            );
        }

        if ((index + 1) % 5 === 0) {
            console.log(`📝 Inserted ${index + 1}/${SAMPLE_TRANSACTIONS.length} transactions`);
        }
    }

    console.log(`✅ Created ${SAMPLE_TRANSACTIONS.length} sample transactions\n`);
    return { userId, storeId };
}

async function showTableContents(storeId, title) {
    console.log(`\n📊 ${title}`);
    console.log('━'.repeat(80));

    // Show shop_memory
    const memoryResult = await pool.query(
        'SELECT memory_type, context, memory_data, confidence, frequency FROM shop_memory WHERE store_id = $1 ORDER BY confidence DESC',
        [storeId]
    );

    if (memoryResult.rows.length > 0) {
        console.log('\n🧠 SHOP MEMORY:');
        console.log('Type'.padEnd(20), 'Context'.padEnd(15), 'Confidence'.padEnd(12), 'Frequency'.padEnd(10), 'Data Sample');
        console.log('-'.repeat(80));

        for (const row of memoryResult.rows.slice(0, 10)) {
            const dataSample = JSON.stringify(row.memory_data).substring(0, 30) + '...';
            console.log(
                row.memory_type.padEnd(20),
                row.context.padEnd(15),
                row.confidence.toString().padEnd(12),
                row.frequency.toString().padEnd(10),
                dataSample
            );
        }
    }

    // Show product_relationships
    const relationshipResult = await pool.query(
        'SELECT product_a, product_b, relationship_type, strength, occurrences FROM product_relationships WHERE store_id = $1 ORDER BY strength DESC',
        [storeId]
    );

    if (relationshipResult.rows.length > 0) {
        console.log('\n🔗 PRODUCT RELATIONSHIPS:');
        console.log('Product A'.padEnd(15), 'Product B'.padEnd(15), 'Type'.padEnd(20), 'Strength'.padEnd(10), 'Count');
        console.log('-'.repeat(80));

        for (const row of relationshipResult.rows.slice(0, 10)) {
            console.log(
                row.product_a.padEnd(15),
                row.product_b.padEnd(15),
                row.relationship_type.padEnd(20),
                row.strength.toString().padEnd(10),
                row.occurrences.toString()
            );
        }
    }

    // Show experience_insights
    const insightResult = await pool.query(
        'SELECT insight_category, title, confidence FROM experience_insights WHERE store_id = $1 ORDER BY confidence DESC',
        [storeId]
    );

    if (insightResult.rows.length > 0) {
        console.log('\n💡 EXPERIENCE INSIGHTS:');
        console.log('Category'.padEnd(20), 'Title'.padEnd(40), 'Confidence');
        console.log('-'.repeat(80));

        for (const row of insightResult.rows) {
            console.log(
                row.insight_category.padEnd(20),
                row.title.padEnd(40),
                row.confidence.toString()
            );
        }
    }
}

async function demonstrateAPI(userId, storeId) {
    console.log('\n🚀 RAG API DEMONSTRATION');
    console.log('━'.repeat(80));

    // Sample inventory for context
    const sampleInventory = [
        { product: 'Milk', quantity: 12, unit: 'liters' },
        { product: 'Bread', quantity: 8, unit: 'loaves' },
        { product: 'Rice', quantity: 5, unit: 'kg' },
        { product: 'Tea', quantity: 15, unit: 'packets' },
        { product: 'Oil', quantity: 3, unit: 'liters' },
        { product: 'Sugar', quantity: 20, unit: 'kg' }
    ];

    console.log('\n📦 CURRENT INVENTORY:');
    console.log(JSON.stringify(sampleInventory, null, 2));

    // Memory-based recommendations
    console.log('\n🎯 MEMORY-BASED RECOMMENDATIONS:');
    try {
        const recommendations = await generateMemoryBasedRecommendations(storeId, sampleInventory);
        console.log(JSON.stringify(recommendations, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }

    // Sales expansion guidance
    console.log('\n💰 SALES EXPANSION GUIDANCE:');
    try {
        const expansionGuidance = await generateSalesExpansionGuidance(storeId, sampleInventory);
        console.log(JSON.stringify(expansionGuidance, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }

    // Experience-driven guidance (if enough data)
    console.log('\n🧠 EXPERIENCE-DRIVEN GUIDANCE:');
    try {
        const input = {
            storeType: 'grocery',
            todayDate: '2026-03-02',
            inventory: sampleInventory,
            recentSales: [
                { product: 'Milk', trend: 'rising' },
                { product: 'Bread', trend: 'stable' },
                { product: 'Tea', trend: 'rising' }
            ],
            shopActivity: {
                recentBusiness: 'growing',
                busyDays: ['Monday', 'Saturday', 'Sunday']
            },
            upcomingFestival: {
                name: 'Holi',
                daysAway: 8
            }
        };

        const experienceGuidance = await generateExperienceGuidance(storeId, 'grocery', input);
        console.log(JSON.stringify(experienceGuidance, null, 2));
    } catch (error) {
        console.log('Error:', error.message);
    }
}

// ── Main Demo Runner ───────────────────────────────────────────────────────

async function runDemo() {
    console.log('🎭 RAG MEMORY SYSTEM DEMO');
    console.log('━'.repeat(80));
    console.log('This demo shows how the RAG system learns from transactions');
    console.log('and builds shop intelligence over time.\n');

    try {
        // Step 1: Create sample data
        const { userId, storeId } = await createDemoData();

        // Step 2: Show empty state
        await showTableContents(storeId, 'INITIAL STATE (No Memory Yet)');

        // Step 3: Initialize RAG memory
        console.log('\n🤖 Initializing RAG memory system...');
        const initResult = await initializeStoreMemory(userId, storeId, 90);
        console.log('Initialization result:', JSON.stringify(initResult, null, 2));

        // Step 4: Show learned memory
        await showTableContents(storeId, 'AFTER RAG LEARNING');

        // Step 5: Check memory health
        console.log('\n🏥 MEMORY HEALTH CHECK:');
        const healthCheck = await checkMemoryHealth(storeId);
        console.log(JSON.stringify(healthCheck, null, 2));

        // Step 6: Demonstrate API responses
        await demonstrateAPI(userId, storeId);

        console.log('\n✅ Demo completed successfully!');
        console.log('\n📚 KEY TAKEAWAYS:');
        console.log('1. RAG system learns product behaviors and relationships from transactions');
        console.log('2. Memory strength improves with more transaction data');
        console.log('3. Recommendations are based on shop-specific patterns, not generic rules');
        console.log('4. Product relationships drive sales expansion opportunities');
        console.log('5. Festival guidance uses historical shop behavior, not generic suggestions\n');

    } catch (error) {
        console.error('❌ Demo failed:', error);
    } finally {
        await pool.end();
    }
}

// Run the demo if called directly
if (require.main === module) {
    runDemo();
}

module.exports = {
    runDemo,
    createDemoData,
    showTableContents,
    demonstrateAPI
};
'use strict';\n/**\n * RAG Memory System Test & Demo Script\n * ────────────────────────────────────────\n * \n * This script demonstrates the complete RAG memory system with sample data.\n * Use it to understand how the system learns and what data looks like in tables.\n * \n * Run: node src/test/ragDemo.js\n */\nrequire('dotenv').config();\nconst pool = require('../config/database');\nconst { initializeStoreMemory, checkMemoryHealth } = require('../ai/transactionLearner');\nconst { generateMemoryBasedRecommendations } = require('../ai/shopMemory');\nconst { generateSalesExpansionGuidance } = require('../ai/relationshipIntelligence');\nconst { generateExperienceGuidance } = require('../ai/experienceEngine');\n\n// Sample data for demonstration\nconst SAMPLE_STORE = {\n    name: 'Sharma General Store',\n    type: 'grocery',\n    region: 'Mumbai'\n};\n\nconst SAMPLE_USER = {\n    name: 'testuser_rag_demo',\n    password: 'demo123'\n};\n\n// Sample transactions showing realistic grocery store patterns\nconst SAMPLE_TRANSACTIONS = [\n    // Week 1 - Basic grocery patterns\n    {\n        merchant: 'Customer A',\n        transaction_date: '2026-02-01 10:30:00',\n        total_amount: 145.50,\n        line_items: [\n            { product_name: 'Milk', quantity: 2, unit_price: 25.00 },\n            { product_name: 'Bread', quantity: 1, unit_price: 20.00 },\n            { product_name: 'Butter', quantity: 1, unit_price: 80.50 }\n        ]\n    },\n    {\n        merchant: 'Customer B',\n        transaction_date: '2026-02-01 14:15:00',\n        total_amount: 280.00,\n        line_items: [\n            { product_name: 'Rice', quantity: 1, unit_price: 150.00 },\n            { product_name: 'Oil', quantity: 1, unit_price: 130.00 }\n        ]\n    },\n    {\n        merchant: 'Customer C',\n        transaction_date: '2026-02-02 09:45:00',\n        total_amount: 95.00,\n        line_items: [\n            { product_name: 'Tea', quantity: 1, unit_price: 45.00 },\n            { product_name: 'Biscuits', quantity: 1, unit_price: 50.00 }\n        ]\n    },\n    \n    // Week 2 - Patterns emerge (same products together)\n    {\n        merchant: 'Customer D',\n        transaction_date: '2026-02-08 11:20:00',\n        total_amount: 125.50,\n        line_items: [\n            { product_name: 'Milk', quantity: 1, unit_price: 25.00 },\n            { product_name: 'Bread', quantity: 2, unit_price: 20.00 },\n            { product_name: 'Butter', quantity: 1, unit_price: 60.50 }\n        ]\n    },\n    {\n        merchant: 'Customer E',\n        transaction_date: '2026-02-09 16:30:00',\n        total_amount: 175.00,\n        line_items: [\n            { product_name: 'Tea', quantity: 2, unit_price: 45.00 },\n            { product_name: 'Biscuits', quantity: 1, unit_price: 50.00 },\n            { product_name: 'Sugar', quantity: 1, unit_price: 35.00 }\n        ]\n    },\n    \n    // Week 3 - More relationship patterns\n    {\n        merchant: 'Customer F',\n        transaction_date: '2026-02-15 08:30:00',\n        total_amount: 310.00,\n        line_items: [\n            { product_name: 'Rice', quantity: 1, unit_price: 150.00 },\n            { product_name: 'Oil', quantity: 1, unit_price: 130.00 },\n            { product_name: 'Onions', quantity: 1, unit_price: 30.00 }\n        ]\n    },\n    {\n        merchant: 'Customer A',\n        transaction_date: '2026-02-16 12:15:00',\n        total_amount: 145.50,\n        line_items: [\n            { product_name: 'Milk', quantity: 2, unit_price: 25.00 },\n            { product_name: 'Bread', quantity: 1, unit_price: 20.00 },\n            { product_name: 'Butter', quantity: 1, unit_price: 75.50 }\n        ]\n    },\n    \n    // Festival season (Holi preparation)\n    {\n        merchant: 'Customer G',\n        transaction_date: '2026-02-20 10:00:00', // Before Holi\n        total_amount: 425.00,\n        line_items: [\n            { product_name: 'Milk', quantity: 3, unit_price: 25.00 },\n            { product_name: 'Sugar', quantity: 2, unit_price: 35.00 },\n            { product_name: 'Ghee', quantity: 1, unit_price: 180.00 },\n            { product_name: 'Sweets', quantity: 1, unit_price: 150.00 }\n        ]\n    },\n    {\n        merchant: 'Customer H',\n        transaction_date: '2026-02-21 15:30:00',\n        total_amount: 320.00,\n        line_items: [\n            { product_name: 'Colors', quantity: 1, unit_price: 80.00 },\n            { product_name: 'Milk', quantity: 4, unit_price: 25.00 },\n            { product_name: 'Sugar', quantity: 3, unit_price: 35.00 },\n            { product_name: 'Snacks', quantity: 1, unit_price: 95.00 }\n        ]\n    },\n    \n    // More regular patterns to strengthen memory\n    ...Array.from({ length: 15 }, (_, i) => ({\n        merchant: `Customer ${String.fromCharCode(73 + i)}`, // Customer I, J, K...\n        transaction_date: `2026-02-${22 + (i % 6)} ${(9 + (i % 12)).toString().padStart(2, '0')}:${(i * 7) % 60}:00`,\n        total_amount: Math.round((Math.random() * 200 + 100) * 100) / 100,\n        line_items: [\n            // Random but realistic combinations\n            ...(Math.random() > 0.4 ? [{ product_name: 'Milk', quantity: Math.ceil(Math.random() * 3), unit_price: 25.00 }] : []),\n            ...(Math.random() > 0.6 ? [{ product_name: 'Bread', quantity: 1, unit_price: 20.00 }] : []),\n            ...(Math.random() > 0.7 ? [{ product_name: 'Tea', quantity: 1, unit_price: 45.00 }] : []),\n            ...(Math.random() > 0.8 ? [{ product_name: 'Rice', quantity: 1, unit_price: 150.00 }] : []),\n            ...(Math.random() > 0.5 ? [{ product_name: 'Biscuits', quantity: 1, unit_price: 50.00 }] : []),\n        ].filter(item => item.product_name) // Remove empty items\n    }))\n];\n\n// ── Demo Functions ─────────────────────────────────────────────────────────\n\nasync function createDemoData() {\n    console.log('🔧 Setting up demo data...');\n    \n    // Create demo user\n    const userResult = await pool.query(\n        'INSERT INTO users (name, password_hash) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',\n        [SAMPLE_USER.name, 'hashed_password_demo']\n    );\n    const userId = userResult.rows[0].id;\n    \n    // Create demo store\n    const storeResult = await pool.query(\n        'INSERT INTO stores (user_id, name, region, type) VALUES ($1, $2, $3, $4) RETURNING *',\n        [userId, SAMPLE_STORE.name, SAMPLE_STORE.region, SAMPLE_STORE.type]\n    );\n    const storeId = storeResult.rows[0].id;\n    \n    console.log(`✅ Created demo store: ${storeId}`);\n    \n    // Insert sample transactions\n    for (const [index, transaction] of SAMPLE_TRANSACTIONS.entries()) {\n        const ledgerResult = await pool.query(\n            'INSERT INTO ledger_entries (user_id, store_id, merchant, transaction_date, total_amount) VALUES ($1, $2, $3, $4, $5) RETURNING *',\n            [userId, storeId, transaction.merchant, transaction.transaction_date, transaction.total_amount]\n        );\n        const ledgerEntryId = ledgerResult.rows[0].id;\n        \n        // Insert line items\n        for (const item of transaction.line_items) {\n            await pool.query(\n                'INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)',\n                [ledgerEntryId, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price]\n            );\n        }\n        \n        if ((index + 1) % 5 === 0) {\n            console.log(`📝 Inserted ${index + 1}/${SAMPLE_TRANSACTIONS.length} transactions`);\n        }\n    }\n    \n    console.log(`✅ Created ${SAMPLE_TRANSACTIONS.length} sample transactions\\n`);\n    return { userId, storeId };\n}\n\nasync function showTableContents(storeId, title) {\n    console.log(`\\n📊 ${title}`);\n    console.log('━'.repeat(80));\n    \n    // Show shop_memory\n    const memoryResult = await pool.query(\n        'SELECT memory_type, context, memory_data, confidence, frequency FROM shop_memory WHERE store_id = $1 ORDER BY confidence DESC',\n        [storeId]\n    );\n    \n    if (memoryResult.rows.length > 0) {\n        console.log('\\n🧠 SHOP MEMORY:');\n        console.log('Type'.padEnd(20), 'Context'.padEnd(15), 'Confidence'.padEnd(12), 'Frequency'.padEnd(10), 'Data Sample');\n        console.log('-'.repeat(80));\n        \n        for (const row of memoryResult.rows.slice(0, 10)) {\n            const dataSample = JSON.stringify(row.memory_data).substring(0, 30) + '...';\n            console.log(\n                row.memory_type.padEnd(20),\n                row.context.padEnd(15),\n                row.confidence.toString().padEnd(12),\n                row.frequency.toString().padEnd(10),\n                dataSample\n            );\n        }\n    }\n    \n    // Show product_relationships\n    const relationshipResult = await pool.query(\n        'SELECT product_a, product_b, relationship_type, strength, occurrences FROM product_relationships WHERE store_id = $1 ORDER BY strength DESC',\n        [storeId]\n    );\n    \n    if (relationshipResult.rows.length > 0) {\n        console.log('\\n🔗 PRODUCT RELATIONSHIPS:');\n        console.log('Product A'.padEnd(15), 'Product B'.padEnd(15), 'Type'.padEnd(20), 'Strength'.padEnd(10), 'Count');\n        console.log('-'.repeat(80));\n        \n        for (const row of relationshipResult.rows.slice(0, 10)) {\n            console.log(\n                row.product_a.padEnd(15),\n                row.product_b.padEnd(15),\n                row.relationship_type.padEnd(20),\n                row.strength.toString().padEnd(10),\n                row.occurrences.toString()\n            );\n        }\n    }\n    \n    // Show experience_insights\n    const insightResult = await pool.query(\n        'SELECT insight_category, title, confidence FROM experience_insights WHERE store_id = $1 ORDER BY confidence DESC',\n        [storeId]\n    );\n    \n    if (insightResult.rows.length > 0) {\n        console.log('\\n💡 EXPERIENCE INSIGHTS:');\n        console.log('Category'.padEnd(20), 'Title'.padEnd(40), 'Confidence');\n        console.log('-'.repeat(80));\n        \n        for (const row of insightResult.rows) {\n            console.log(\n                row.insight_category.padEnd(20),\n                row.title.padEnd(40),\n                row.confidence.toString()\n            );\n        }\n    }\n}\n\nasync function demonstrateAPI(userId, storeId) {\n    console.log('\\n🚀 RAG API DEMONSTRATION');\n    console.log('━'.repeat(80));\n    \n    // Sample inventory for context\n    const sampleInventory = [\n        { product: 'Milk', quantity: 12, unit: 'liters' },\n        { product: 'Bread', quantity: 8, unit: 'loaves' },\n        { product: 'Rice', quantity: 5, unit: 'kg' },\n        { product: 'Tea', quantity: 15, unit: 'packets' },\n        { product: 'Oil', quantity: 3, unit: 'liters' },\n        { product: 'Sugar', quantity: 20, unit: 'kg' }\n    ];\n    \n    console.log('\\n📦 CURRENT INVENTORY:');\n    console.log(JSON.stringify(sampleInventory, null, 2));\n    \n    // Memory-based recommendations\n    console.log('\\n🎯 MEMORY-BASED RECOMMENDATIONS:');\n    try {\n        const recommendations = await generateMemoryBasedRecommendations(storeId, sampleInventory);\n        console.log(JSON.stringify(recommendations, null, 2));\n    } catch (error) {\n        console.log('Error:', error.message);\n    }\n    \n    // Sales expansion guidance\n    console.log('\\n💰 SALES EXPANSION GUIDANCE:');\n    try {\n        const expansionGuidance = await generateSalesExpansionGuidance(storeId, sampleInventory);\n        console.log(JSON.stringify(expansionGuidance, null, 2));\n    } catch (error) {\n        console.log('Error:', error.message);\n    }\n    \n    // Experience-driven guidance (if enough data)\n    console.log('\\n🧠 EXPERIENCE-DRIVEN GUIDANCE:');\n    try {\n        const input = {\n            storeType: 'grocery',\n            todayDate: '2026-03-02',\n            inventory: sampleInventory,\n            recentSales: [\n                { product: 'Milk', trend: 'rising' },\n                { product: 'Bread', trend: 'stable' },\n                { product: 'Tea', trend: 'rising' }\n            ],\n            shopActivity: {\n                recentBusiness: 'growing',\n                busyDays: ['Monday', 'Saturday', 'Sunday']\n            },\n            upcomingFestival: {\n                name: 'Holi',\n                daysAway: 8\n            }\n        };\n        \n        const experienceGuidance = await generateExperienceGuidance(storeId, 'grocery', input);\n        console.log(JSON.stringify(experienceGuidance, null, 2));\n    } catch (error) {\n        console.log('Error:', error.message);\n    }\n}\n\n// ── Main Demo Runner ───────────────────────────────────────────────────────\n\nasync function runDemo() {\n    console.log('🎭 RAG MEMORY SYSTEM DEMO');\n    console.log('━'.repeat(80));\n    console.log('This demo shows how the RAG system learns from transactions');\n    console.log('and builds shop intelligence over time.\\n');\n    \n    try {\n        // Step 1: Create sample data\n        const { userId, storeId } = await createDemoData();\n        \n        // Step 2: Show empty state\n        await showTableContents(storeId, 'INITIAL STATE (No Memory Yet)');\n        \n        // Step 3: Initialize RAG memory\n        console.log('\\n🤖 Initializing RAG memory system...');\n        const initResult = await initializeStoreMemory(userId, storeId, 90);\n        console.log('Initialization result:', JSON.stringify(initResult, null, 2));\n        \n        // Step 4: Show learned memory\n        await showTableContents(storeId, 'AFTER RAG LEARNING');\n        \n        // Step 5: Check memory health\n        console.log('\\n🏥 MEMORY HEALTH CHECK:');\n        const healthCheck = await checkMemoryHealth(storeId);\n        console.log(JSON.stringify(healthCheck, null, 2));\n        \n        // Step 6: Demonstrate API responses\n        await demonstrateAPI(userId, storeId);\n        \n        console.log('\\n✅ Demo completed successfully!');\n        console.log('\\n📚 KEY TAKEAWAYS:');\n        console.log('1. RAG system learns product behaviors and relationships from transactions');\n        console.log('2. Memory strength improves with more transaction data');\n        console.log('3. Recommendations are based on shop-specific patterns, not generic rules');\n        console.log('4. Product relationships drive sales expansion opportunities');\n        console.log('5. Festival guidance uses historical shop behavior, not generic suggestions\\n');\n        \n    } catch (error) {\n        console.error('❌ Demo failed:', error);\n    } finally {\n        await pool.end();\n    }\n}\n\n// Run the demo if called directly\nif (require.main === module) {\n    runDemo();\n}\n\nmodule.exports = {\n    runDemo,\n    createDemoData,\n    showTableContents,\n    demonstrateAPI\n};