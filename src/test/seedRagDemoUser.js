'use strict';
/**
 * Seed script for testuser_rag_demo
 * ──────────────────────────────────
 * - Fixes the password hash
 * - Ensures a grocery store exists for the user
 * - Inserts 35 realistic grocery transactions across 90 days
 * - Seeds current stock levels
 * - Triggers RAG learning so memory tables are populated
 *
 * Run: node src/test/seedRagDemoUser.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { learnFromNewTransaction } = require('../ai/transactionLearner');
const { discoverProductRelationships } = require('../ai/relationshipIntelligence');
const { generateExperienceInsights } = require('../ai/shopMemory');

const USER_ID   = '8aa203c5-8549-496e-a0a9-c1d3285af60f';
const USER_NAME = 'testuser_rag_demo';
const PASSWORD  = 'demo123';

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n, hourOffset = 10) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(hourOffset, Math.floor(Math.random() * 60), 0, 0);
    return d.toISOString();
}

function log(msg, color = '\x1b[0m') { console.log(`${color}${msg}\x1b[0m`); }
const green  = '\x1b[32m';
const yellow = '\x1b[33m';
const blue   = '\x1b[34m';
const cyan   = '\x1b[36m';
const red    = '\x1b[31m';
const bold   = '\x1b[1m';

// ── Transactions ─────────────────────────────────────────────────────────────
// 35 transactions across 90 days.
// Patterns to teach RAG:
//   - Milk + Bread + Butter bought together very often  (→ relationship)
//   - Tea + Sugar almost always together               (→ relationship)
//   - Rice + Toor Dal frequently together              (→ relationship)
//   - Milk + Curd frequently together                  (→ relationship)
//   - Chips + Cold Drink snack pairing                 (→ relationship)
//   - Milk is the top strength product (high frequency + volume)
//   - Saturday has highest transaction volume          (→ operational_rhythm)

const TRANSACTIONS = [
    // ── 90 days ago ──────────────────────────────────────────────────────────
    {
        merchant: 'Kavita Sharma', date: daysAgo(90, 9), amount: 215.0,
        items: [
            { product_name: 'Milk 1L', quantity: 2, unit_price: 28.0, total_price: 56.0 },
            { product_name: 'Bread',   quantity: 1, unit_price: 40.0, total_price: 40.0 },
            { product_name: 'Butter',  quantity: 1, unit_price: 55.0, total_price: 55.0 },
            { product_name: 'Sugar 1kg', quantity: 1, unit_price: 50.0, total_price: 50.0 },
            { product_name: 'Tea 250g', quantity: 1, unit_price: 75.0, total_price: 75.0 },  // This makes 276 but let's keep amounts simple
        ]
    },
    {
        merchant: 'Ramesh Patel', date: daysAgo(88, 11), amount: 310.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Toor Dal 1kg',     quantity: 1, unit_price: 130.0, total_price: 130.0 },
        ]
    },
    {
        merchant: 'Sunita Gupta', date: daysAgo(86, 17), amount: 130.0,
        items: [
            { product_name: 'Tea 250g', quantity: 1, unit_price: 75.0, total_price: 75.0 },
            { product_name: 'Sugar 1kg', quantity: 1, unit_price: 50.0, total_price: 50.0 },
            { product_name: 'Parle-G Biscuit', quantity: 1, unit_price: 10.0, total_price: 10.0 },
        ]
    },
    // ── 80–70 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Kavita Sharma', date: daysAgo(83, 9), amount: 195.0,
        items: [
            { product_name: 'Milk 1L',  quantity: 3, unit_price: 28.0, total_price: 84.0 },
            { product_name: 'Bread',    quantity: 1, unit_price: 40.0, total_price: 40.0 },
            { product_name: 'Curd 400g',quantity: 1, unit_price: 38.0, total_price: 38.0 },
        ]
    },
    {
        merchant: 'Anil Verma', date: daysAgo(81, 16), amount: 285.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Mustard Oil 1L',   quantity: 1, unit_price: 105.0, total_price: 105.0 },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(79, 10), amount: 220.0,
        items: [
            { product_name: 'Milk 1L',    quantity: 2, unit_price: 28.0, total_price: 56.0 },
            { product_name: 'Butter',     quantity: 1, unit_price: 55.0, total_price: 55.0 },
            { product_name: 'Bread',      quantity: 1, unit_price: 40.0, total_price: 40.0 },
            { product_name: 'Eggs (6 pcs)', quantity: 1, unit_price: 60.0, total_price: 60.0 },
        ]
    },
    {
        merchant: 'Sunita Gupta', date: daysAgo(76, 18), amount: 125.0,
        items: [
            { product_name: 'Tea 250g',   quantity: 1, unit_price: 75.0, total_price: 75.0 },
            { product_name: 'Sugar 1kg',  quantity: 1, unit_price: 50.0, total_price: 50.0 },
        ]
    },
    {
        merchant: 'Mahesh Singh', date: daysAgo(74, 14), amount: 370.0,
        items: [
            { product_name: 'Lays Chips 50g',  quantity: 3, unit_price: 20.0, total_price: 60.0 },
            { product_name: 'Pepsi 1.25L',     quantity: 2, unit_price: 50.0, total_price: 100.0 },
            { product_name: 'Kurkure 45g',     quantity: 3, unit_price: 20.0, total_price: 60.0 },
            { product_name: 'Thums Up 600ml',  quantity: 3, unit_price: 35.0, total_price: 105.0 },
        ]
    },
    // ── 70–60 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Kavita Sharma', date: daysAgo(71, 9), amount: 163.0,
        items: [
            { product_name: 'Milk 1L',   quantity: 2, unit_price: 28.0, total_price: 56.0 },
            { product_name: 'Curd 400g', quantity: 2, unit_price: 38.0, total_price: 76.0 },
            { product_name: 'Bread',     quantity: 1, unit_price: 40.0, total_price: 40.0 },
        ]
    },
    {
        merchant: 'Ramesh Patel', date: daysAgo(69, 11), amount: 310.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Toor Dal 1kg',     quantity: 1, unit_price: 130.0, total_price: 130.0 },
        ]
    },
    {
        merchant: 'Pooja Mehta', date: daysAgo(67, 15), amount: 480.0,
        items: [
            { product_name: 'Moong Dal 1kg',    quantity: 2, unit_price: 140.0, total_price: 280.0 },
            { product_name: 'Chana Dal 1kg',    quantity: 1, unit_price: 120.0, total_price: 120.0 },
            { product_name: 'Turmeric 100g',    quantity: 2, unit_price: 22.0,  total_price: 44.0 },
        ]
    },
    {
        merchant: 'Anil Verma', date: daysAgo(65, 10), amount: 200.0,
        items: [
            { product_name: 'Mustard Oil 1L',    quantity: 1, unit_price: 105.0, total_price: 105.0 },
            { product_name: 'Sunflower Oil 1L',  quantity: 1, unit_price: 95.0,  total_price: 95.0 },
        ]
    },
    {
        merchant: 'Sunita Gupta', date: daysAgo(63, 9), amount: 125.0,
        items: [
            { product_name: 'Tea 250g',  quantity: 1, unit_price: 75.0, total_price: 75.0 },
            { product_name: 'Sugar 1kg', quantity: 1, unit_price: 50.0, total_price: 50.0 },
        ]
    },
    // ── 60–45 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Priya Nair', date: daysAgo(59, 11), amount: 151.0,
        items: [
            { product_name: 'Milk 1L',     quantity: 2, unit_price: 28.0, total_price: 56.0 },
            { product_name: 'Butter',      quantity: 1, unit_price: 55.0, total_price: 55.0 },
            { product_name: 'Bread',       quantity: 1, unit_price: 40.0, total_price: 40.0 },
        ]
    },
    {
        merchant: 'Mahesh Singh', date: daysAgo(57, 16), amount: 160.0,
        items: [
            { product_name: 'Lays Chips 50g', quantity: 4, unit_price: 20.0, total_price: 80.0 },
            { product_name: 'Pepsi 1.25L',    quantity: 2, unit_price: 50.0, total_price: 100.0 },
        ]
    },
    {
        merchant: 'Ramesh Patel', date: daysAgo(55, 10), amount: 310.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Toor Dal 1kg',     quantity: 1, unit_price: 130.0, total_price: 130.0 },
        ]
    },
    {
        merchant: 'Kavita Sharma', date: daysAgo(53, 9), amount: 206.0,
        items: [
            { product_name: 'Milk 1L',    quantity: 3, unit_price: 28.0, total_price: 84.0 },
            { product_name: 'Curd 400g',  quantity: 2, unit_price: 38.0, total_price: 76.0 },
            { product_name: 'Eggs (6 pcs)', quantity: 1, unit_price: 60.0, total_price: 60.0 },
        ]
    },
    {
        merchant: 'Pooja Mehta', date: daysAgo(50, 14), amount: 445.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Moong Dal 1kg',    quantity: 1, unit_price: 140.0, total_price: 140.0 },
            { product_name: 'Turmeric 100g',    quantity: 2, unit_price: 22.0,  total_price: 44.0 },
            { product_name: 'Red Chilli Powder 100g', quantity: 1, unit_price: 30.0, total_price: 30.0 },
        ]
    },
    {
        merchant: 'Sunita Gupta', date: daysAgo(48, 9), amount: 125.0,
        items: [
            { product_name: 'Tea 250g',  quantity: 1, unit_price: 75.0, total_price: 75.0 },
            { product_name: 'Sugar 1kg', quantity: 1, unit_price: 50.0, total_price: 50.0 },
        ]
    },
    // ── 45–30 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Anil Verma', date: daysAgo(44, 11), amount: 455.0,
        items: [
            { product_name: 'Mustard Oil 1L',   quantity: 2, unit_price: 105.0, total_price: 210.0 },
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Toor Dal 1kg',     quantity: 1, unit_price: 130.0, total_price: 130.0 },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(42, 10), amount: 218.0,
        items: [
            { product_name: 'Milk 1L',    quantity: 2, unit_price: 28.0, total_price: 56.0 },
            { product_name: 'Bread',      quantity: 2, unit_price: 40.0, total_price: 80.0 },
            { product_name: 'Butter',     quantity: 1, unit_price: 55.0, total_price: 55.0 },
            { product_name: 'Curd 400g',  quantity: 1, unit_price: 38.0, total_price: 38.0 },
        ]
    },
    {
        merchant: 'Mahesh Singh', date: daysAgo(40, 15), amount: 240.0,
        items: [
            { product_name: 'Lays Chips 50g', quantity: 4, unit_price: 20.0,  total_price: 80.0 },
            { product_name: 'Thums Up 600ml', quantity: 4, unit_price: 35.0,  total_price: 140.0 },
            { product_name: 'Kurkure 45g',    quantity: 2, unit_price: 20.0,  total_price: 40.0 },
        ]
    },
    {
        merchant: 'Kavita Sharma', date: daysAgo(38, 9), amount: 162.0,
        items: [
            { product_name: 'Milk 1L',   quantity: 2, unit_price: 28.0, total_price: 56.0 },
            { product_name: 'Bread',     quantity: 1, unit_price: 40.0, total_price: 40.0 },
            { product_name: 'Curd 400g', quantity: 1, unit_price: 38.0, total_price: 38.0 },
            { product_name: 'Butter',    quantity: 1, unit_price: 55.0, total_price: 55.0 },
        ]
    },
    // ── 30–15 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Sunita Gupta', date: daysAgo(33, 9), amount: 200.0,
        items: [
            { product_name: 'Tea 250g',   quantity: 2, unit_price: 75.0, total_price: 150.0 },
            { product_name: 'Sugar 1kg',  quantity: 1, unit_price: 50.0, total_price: 50.0 },
        ]
    },
    {
        merchant: 'Ramesh Patel', date: daysAgo(31, 11), amount: 465.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Toor Dal 1kg',     quantity: 2, unit_price: 130.0, total_price: 260.0 },
            { product_name: 'Turmeric 100g',    quantity: 1, unit_price: 22.0,  total_price: 22.0 },
        ]
    },
    {
        merchant: 'Pooja Mehta', date: daysAgo(28, 14), amount: 320.0,
        items: [
            { product_name: 'Moong Dal 1kg',  quantity: 1, unit_price: 140.0, total_price: 140.0 },
            { product_name: 'Chana Dal 1kg',  quantity: 1, unit_price: 120.0, total_price: 120.0 },
            { product_name: 'Mustard Oil 1L', quantity: 1, unit_price: 105.0, total_price: 105.0 },
        ]
    },
    {
        merchant: 'Kavita Sharma', date: daysAgo(26, 9), amount: 190.0,
        items: [
            { product_name: 'Milk 1L',    quantity: 3, unit_price: 28.0, total_price: 84.0 },
            { product_name: 'Curd 400g',  quantity: 2, unit_price: 38.0, total_price: 76.0 },
            { product_name: 'Bread',      quantity: 1, unit_price: 40.0, total_price: 40.0 },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(24, 10), amount: 151.0,
        items: [
            { product_name: 'Milk 1L',  quantity: 2, unit_price: 28.0, total_price: 56.0 },
            { product_name: 'Bread',    quantity: 1, unit_price: 40.0, total_price: 40.0 },
            { product_name: 'Butter',   quantity: 1, unit_price: 55.0, total_price: 55.0 },
        ]
    },
    // ── Last 14 days (recent trend — rising milk, snacks picking up) ──────────
    {
        merchant: 'Sunita Gupta', date: daysAgo(13, 9), amount: 125.0,
        items: [
            { product_name: 'Tea 250g',  quantity: 1, unit_price: 75.0, total_price: 75.0 },
            { product_name: 'Sugar 1kg', quantity: 1, unit_price: 50.0, total_price: 50.0 },
        ]
    },
    {
        merchant: 'Kavita Sharma', date: daysAgo(11, 9), amount: 246.0,
        items: [
            { product_name: 'Milk 1L',    quantity: 4, unit_price: 28.0, total_price: 112.0 },
            { product_name: 'Curd 400g',  quantity: 2, unit_price: 38.0, total_price: 76.0 },
            { product_name: 'Butter',     quantity: 1, unit_price: 55.0, total_price: 55.0 },
            { product_name: 'Bread',      quantity: 1, unit_price: 40.0, total_price: 40.0 },
        ]
    },
    {
        merchant: 'Mahesh Singh', date: daysAgo(9, 16), amount: 320.0,
        items: [
            { product_name: 'Lays Chips 50g', quantity: 5, unit_price: 20.0,  total_price: 100.0 },
            { product_name: 'Pepsi 1.25L',    quantity: 3, unit_price: 50.0,  total_price: 150.0 },
            { product_name: 'Kurkure 45g',    quantity: 4, unit_price: 20.0,  total_price: 80.0 },
        ]
    },
    {
        merchant: 'Ramesh Patel', date: daysAgo(7, 11), amount: 310.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Toor Dal 1kg',     quantity: 1, unit_price: 130.0, total_price: 130.0 },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(5, 10), amount: 224.0,
        items: [
            { product_name: 'Milk 1L',    quantity: 3, unit_price: 28.0, total_price: 84.0 },
            { product_name: 'Bread',      quantity: 2, unit_price: 40.0, total_price: 80.0 },
            { product_name: 'Butter',     quantity: 1, unit_price: 55.0, total_price: 55.0 },
        ]
    },
    {
        merchant: 'Pooja Mehta', date: daysAgo(3, 14), amount: 356.0,
        items: [
            { product_name: 'Basmati Rice 5kg', quantity: 1, unit_price: 180.0, total_price: 180.0 },
            { product_name: 'Toor Dal 1kg',     quantity: 1, unit_price: 130.0, total_price: 130.0 },
            { product_name: 'Turmeric 100g',    quantity: 2, unit_price: 22.0,  total_price: 44.0 },
        ]
    },
    {
        merchant: 'Kavita Sharma', date: daysAgo(1, 9), amount: 240.0,
        items: [
            { product_name: 'Milk 1L',    quantity: 4, unit_price: 28.0, total_price: 112.0 },
            { product_name: 'Curd 400g',  quantity: 2, unit_price: 38.0, total_price: 76.0 },
            { product_name: 'Butter',     quantity: 1, unit_price: 55.0, total_price: 55.0 },
            { product_name: 'Eggs (6 pcs)', quantity: 1, unit_price: 60.0, total_price: 60.0 },
        ]
    },
];

// ── Stock items (current inventory) ──────────────────────────────────────────
const STOCK_ITEMS = [
    // ── Dairy & Breakfast ─────────────────────────────────────────────────────
    { product_name: 'Milk 1L',            quantity: 8,  unit: 'pcs' },
    { product_name: 'Bread',              quantity: 5,  unit: 'pcs' },
    { product_name: 'Butter',             quantity: 4,  unit: 'pcs' },
    { product_name: 'Curd 400g',          quantity: 6,  unit: 'pcs' },
    { product_name: 'Eggs (6 pcs)',        quantity: 3,  unit: 'pcs' },
    // ── Beverages ─────────────────────────────────────────────────────────────
    { product_name: 'Tea 250g',           quantity: 7,  unit: 'pcs' },
    { product_name: 'Sugar 1kg',          quantity: 5,  unit: 'pcs' },
    // ── Staples ───────────────────────────────────────────────────────────────
    { product_name: 'Basmati Rice 5kg',   quantity: 12, unit: 'pcs' },
    { product_name: 'Toor Dal 1kg',       quantity: 4,  unit: 'pcs' },
    { product_name: 'Moong Dal 1kg',      quantity: 3,  unit: 'pcs' },
    { product_name: 'Chana Dal 1kg',      quantity: 2,  unit: 'pcs' },
    { product_name: 'Poha 500g',          quantity: 5,  unit: 'pcs' },
    { product_name: 'Besan 500g',         quantity: 3,  unit: 'pcs' },
    { product_name: 'Rawa 500g',          quantity: 4,  unit: 'pcs' },
    // ── Oils & Spices ─────────────────────────────────────────────────────────
    { product_name: 'Mustard Oil 1L',     quantity: 6,  unit: 'pcs' },
    { product_name: 'Sunflower Oil 1L',   quantity: 4,  unit: 'pcs' },
    { product_name: 'Ghee 500ml',         quantity: 3,  unit: 'pcs' },
    { product_name: 'Turmeric 100g',      quantity: 8,  unit: 'pcs' },
    { product_name: 'Red Chilli Powder 100g', quantity: 5, unit: 'pcs' },
    // ── Festival & Puja ───────────────────────────────────────────────────────
    { product_name: 'Dry Fruits Mix 200g',quantity: 4,  unit: 'pcs' },
    { product_name: 'Coconut',            quantity: 6,  unit: 'pcs' },
    { product_name: 'Agarbatti Pack',     quantity: 8,  unit: 'pcs' },
    { product_name: 'Camphor Tablet',     quantity: 10, unit: 'pcs' },
    // ── Snacks & Drinks ───────────────────────────────────────────────────────
    { product_name: 'Lays Chips 50g',     quantity: 15, unit: 'pcs' },
    { product_name: 'Kurkure 45g',        quantity: 10, unit: 'pcs' },
    { product_name: 'Pepsi 1.25L',        quantity: 12, unit: 'pcs' },
    { product_name: 'Thums Up 600ml',     quantity: 8,  unit: 'pcs' },
    { product_name: 'Parle-G Biscuit',    quantity: 20, unit: 'pcs' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
    try {
        log('\n════════════════════════════════════════════════', cyan);
        log('  Seeding testuser_rag_demo', bold);
        log('════════════════════════════════════════════════', cyan);

        // ── 1. Upsert user (create if not exists, fix password if exists) ──────
        log('\n👤 Creating / resetting user...', blue);
        const hash = await bcrypt.hash(PASSWORD, 10);
        await pool.query(
            `INSERT INTO users (id, name, password_hash)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET password_hash = $3`,
            [USER_ID, USER_NAME, hash]
        );
        log(`  ✅ Upserted user ${USER_NAME} (hash: ${hash.substring(0, 20)}...)`, green);

        // ── 2. Ensure store exists ──────────────────────────────────────────
        log('\n🏪 Checking store...', blue);
        let { rows: storeRows } = await pool.query(
            'SELECT id FROM stores WHERE user_id = $1 LIMIT 1',
            [USER_ID]
        );

        let storeId;
        if (storeRows.length === 0) {
            const { rows: newStore } = await pool.query(
                `INSERT INTO stores (user_id, name, region, type)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [USER_ID, 'Sharma Kirana Store', 'Delhi', 'grocery']
            );
            storeId = newStore[0].id;
            log(`  ✅ Created store: Sharma Kirana Store (ID: ${storeId})`, green);
        } else {
            storeId = storeRows[0].id;
            // Make sure it's typed as grocery
            await pool.query(
                `UPDATE stores SET name = 'Sharma Kirana Store', type = 'grocery', region = 'Delhi'
                 WHERE id = $1`,
                [storeId]
            );
            log(`  ✅ Using existing store (ID: ${storeId})`, yellow);
        }

        // ── 3. Clear existing data for clean slate ──────────────────────────
        log('\n🧹 Clearing existing data...', blue);
        await pool.query('DELETE FROM ai_insights   WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM shop_memory   WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM product_relationships WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM experience_insights   WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM stock_items   WHERE user_id  = $1', [USER_ID]);
        await pool.query('DELETE FROM order_items   WHERE user_id  = $1', [USER_ID]);
        // Delete line_items via ledger_entries cascade
        const { rows: existingLedger } = await pool.query(
            'SELECT id FROM ledger_entries WHERE user_id = $1', [USER_ID]
        );
        if (existingLedger.length > 0) {
            const ids = existingLedger.map(r => r.id);
            await pool.query('DELETE FROM line_items WHERE ledger_entry_id = ANY($1)', [ids]);
        }
        await pool.query('DELETE FROM ledger_entries WHERE user_id = $1', [USER_ID]);
        await pool.query('DELETE FROM bills WHERE user_id = $1', [USER_ID]);
        log('  ✅ Existing data cleared', green);

        // ── 4. Insert transactions ──────────────────────────────────────────
        log(`\n📦 Inserting ${TRANSACTIONS.length} transactions...`, blue);
        const ledgerIds = [];

        for (const [i, tx] of TRANSACTIONS.entries()) {
            // Bill
            const { rows: [bill] } = await pool.query(
                `INSERT INTO bills (user_id, store_id, source, status, created_at)
                 VALUES ($1, $2, 'manual', 'COMPLETED', $3) RETURNING id`,
                [USER_ID, storeId, tx.date]
            );

            // Ledger entry
            const { rows: [ledger] } = await pool.query(
                `INSERT INTO ledger_entries
                   (user_id, store_id, bill_id, merchant, transaction_date, total_amount, transaction_type, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'income', $5) RETURNING id`,
                [USER_ID, storeId, bill.id, tx.merchant, tx.date, tx.amount]
            );

            // Line items
            for (const item of tx.items) {
                await pool.query(
                    `INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [ledger.id, item.product_name, item.quantity, item.unit_price, item.total_price]
                );
            }

            ledgerIds.push(ledger.id);
            process.stdout.write(`  ✅ Tx ${i + 1}/${TRANSACTIONS.length}: ${tx.merchant} ₹${tx.amount}\n`);
        }

        // ── 5. Seed stock items ─────────────────────────────────────────────
        log(`\n📊 Seeding ${STOCK_ITEMS.length} stock items...`, blue);
        for (const item of STOCK_ITEMS) {
            await pool.query(
                `INSERT INTO stock_items (user_id, store_id, product_name, quantity, unit)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (store_id, product_name) DO UPDATE
                 SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit`,
                [USER_ID, storeId, item.product_name, item.quantity, item.unit]
            );
        }
        log('  ✅ Stock items seeded', green);

        // ── 6. Run RAG learning ─────────────────────────────────────────────
        log('\n🧠 Running RAG learning on all transactions...', blue);
        let learned = 0;
        for (const ledgerId of ledgerIds) {
            try {
                await learnFromNewTransaction(ledgerId);
                learned++;
            } catch (e) {
                // Non-fatal — log and continue
                log(`  ⚠️  Learning skipped for ${ledgerId}: ${e.message}`, yellow);
            }
        }
        log(`  ✅ Learned from ${learned}/${ledgerIds.length} transactions`, green);

        // ── 7. Deep relationship discovery ─────────────────────────────────
        log('\n🔗 Running relationship discovery (90-day window)...', blue);
        try {
            const rels = await discoverProductRelationships(storeId, 90);
            log(`  ✅ Discovered ${rels.length} product relationships`, green);
        } catch (e) {
            log(`  ⚠️  Relationship discovery: ${e.message}`, yellow);
        }

        // ── 8. Generate experience insights ────────────────────────────────
        log('\n💡 Generating experience insights...', blue);
        try {
            const insights = await generateExperienceInsights(storeId);
            log(`  ✅ Generated ${insights.length} experience insights`, green);
        } catch (e) {
            log(`  ⚠️  Experience insights: ${e.message}`, yellow);
        }

        // ── 9. Summary ──────────────────────────────────────────────────────
        log('\n════════════════════════════════════════════════', cyan);
        log('  Done! Summary', bold);
        log('════════════════════════════════════════════════', cyan);

        const [memCount, relCount, insightCount, ledgerCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM shop_memory WHERE store_id = $1', [storeId]),
            pool.query('SELECT COUNT(*) FROM product_relationships WHERE store_id = $1', [storeId]),
            pool.query('SELECT COUNT(*) FROM experience_insights WHERE store_id = $1', [storeId]),
            pool.query('SELECT COUNT(*) FROM ledger_entries WHERE user_id = $1', [USER_ID]),
        ]);

        log(`  User       : ${USER_NAME}`, green);
        log(`  Password   : ${PASSWORD}  (bcrypt hashed)`, green);
        log(`  Store ID   : ${storeId}`, green);
        log(`  Transactions: ${ledgerCount.rows[0].count}`, green);
        log(`  Shop Memory : ${memCount.rows[0].count} rows`, green);
        log(`  Relationships: ${relCount.rows[0].count} rows`, green);
        log(`  Insights    : ${insightCount.rows[0].count} rows`, green);
        log('\n  🚀 Login with: testuser_rag_demo / demo123', bold);
        log('════════════════════════════════════════════════\n', cyan);

    } catch (err) {
        log(`\n❌ Fatal error: ${err.message}`, red);
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run();
