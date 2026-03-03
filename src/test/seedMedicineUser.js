'use strict';
/**
 * Seed script for Test User Medicine
 * ────────────────────────────────────
 * - Creates (or resets) user "testuser_medicine" with password "medicine123"
 * - Creates a pharmacy store "Arogya Medical Store"
 * - Inserts 60 realistic pharmacy transactions across 120 days
 * - Seeds current stock levels for 40+ medicines
 * - Triggers RAG learning so memory tables are populated
 *
 * Run: node src/test/seedMedicineUser.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('../config/database');
const { learnFromNewTransaction }       = require('../ai/transactionLearner');
const { discoverProductRelationships }  = require('../ai/relationshipIntelligence');
const { generateExperienceInsights }    = require('../ai/shopMemory');

const USER_NAME = 'testuser_medicine';
const PASSWORD  = 'medicine123';

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

// ── 60 Transactions ───────────────────────────────────────────────────────────
// Key patterns to teach RAG:
//  - Paracetamol + Cetirizine + Cough Syrup → cold/flu combo (very frequent)
//  - Metformin + Glimepiride + Telmisartan → diabetic patient (recurring monthly)
//  - Omeprazole + Pantoprazole → acidity meds (frequent)
//  - Vitamin D3 + Calcium + B12 → supplement combo (weekly)
//  - Azithromycin + Dolo 650 → infection pack (moderate)
//  - Insulin Glargine + Glucometer Strips → diabetic supply (high value)
//  - ORS Sachet + Ondansetron → gastro pack (seasonal)
//  - Atorvastatin + Aspirin 75mg → cardiac combo (daily)
//  - Monday mornings: highest chronic prescription refills
//  - Evening rush (17:00–20:00): OTC cold/fever purchases

const TRANSACTIONS = [
    // ── 120–110 days ago ─────────────────────────────────────────────────────
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(120, 10), amount: 1240.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',   qty: 4,  unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 3,  unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',  qty: 2,  unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2,  unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',      qty: 2,  unitPrice: 28.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Anjali Bose', date: daysAgo(119, 18), amount: 285.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 1, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 1, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Ravi Kapoor', date: daysAgo(117, 11), amount: 560.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',         qty: 1,  unitPrice: 380.0, unit: 'pen' },
            { name: 'Glucometer Test Strips (25 pcs)',  qty: 1,  unitPrice: 180.0, unit: 'box' },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(116, 17), amount: 320.0,
        items: [
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4,  unitPrice: 42.0, unit: 'sachet' },
            { name: 'Calcium + Vit D3 Tab (Strip 15)',  qty: 2,  unitPrice: 68.0, unit: 'strip' },
            { name: 'Methylcobalamin B12 (Strip 10)',   qty: 1,  unitPrice: 52.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Suresh Mehta', date: daysAgo(115, 9), amount: 410.0,
        items: [
            { name: 'Omeprazole 20mg (Strip of 15)',    qty: 2, unitPrice: 38.0, unit: 'strip' },
            { name: 'Domperidone 10mg (Strip of 10)',   qty: 2, unitPrice: 32.0, unit: 'strip' },
            { name: 'Sucralfate Syrup 100ml',           qty: 1, unitPrice: 88.0, unit: 'bottle' },
            { name: 'Rabeprazole 20mg (Strip of 10)',   qty: 2, unitPrice: 56.0, unit: 'strip' },
        ]
    },

    // ── 110–100 days ago ─────────────────────────────────────────────────────
    {
        merchant: 'Kiran Patel', date: daysAgo(112, 8), amount: 670.0,
        items: [
            { name: 'Amoxicillin 500mg (Strip of 10)', qty: 2, unitPrice: 88.0, unit: 'strip' },
            { name: 'Azithromycin 500mg (Strip of 3)', qty: 2, unitPrice: 85.0, unit: 'strip' },
            { name: 'Dolo 650 (Strip of 15)',          qty: 3, unitPrice: 30.0, unit: 'strip' },
            { name: 'Levocetirizine 5mg (Strip of 10)',qty: 2, unitPrice: 42.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(110, 10), amount: 1280.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',   qty: 4,  unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 3,  unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',  qty: 2,  unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2,  unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',      qty: 2,  unitPrice: 28.0,  unit: 'strip' },
            { name: 'Vitamin D3 60K IU Sachet',        qty: 4,  unitPrice: 42.0,  unit: 'sachet' },
        ]
    },
    {
        merchant: 'Fatima Shaikh', date: daysAgo(108, 19), amount: 215.0,
        items: [
            { name: 'ORS Sachet Orange Flavour',        qty: 5, unitPrice: 15.0, unit: 'sachet' },
            { name: 'Ondansetron 4mg (Strip of 10)',    qty: 1, unitPrice: 55.0, unit: 'strip' },
            { name: 'Norfloxacin 400mg (Strip of 10)', qty: 1, unitPrice: 72.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Varun Sharma', date: daysAgo(106, 15), amount: 490.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 3, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 2, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 2, unitPrice: 95.0, unit: 'bottle' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 2, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Ravi Kapoor', date: daysAgo(105, 11), amount: 560.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 1,  unitPrice: 380.0, unit: 'pen' },
            { name: 'Glucometer Test Strips (25 pcs)', qty: 1,  unitPrice: 180.0, unit: 'box' },
        ]
    },

    // ── 100–90 days ago ──────────────────────────────────────────────────────
    {
        merchant: 'Deepa Iyer', date: daysAgo(100, 9), amount: 345.0,
        items: [
            { name: 'Calcium + Vit D3 Tab (Strip 15)', qty: 2, unitPrice: 68.0,  unit: 'strip' },
            { name: 'Methylcobalamin B12 (Strip 10)',  qty: 2, unitPrice: 52.0,  unit: 'strip' },
            { name: 'Iron + Folic Acid (Strip 30)',    qty: 1, unitPrice: 85.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Suresh Mehta', date: daysAgo(98, 17), amount: 350.0,
        items: [
            { name: 'Pantoprazole 40mg (Strip 15)',     qty: 2, unitPrice: 58.0,  unit: 'strip' },
            { name: 'Omeprazole 20mg (Strip of 15)',    qty: 2, unitPrice: 38.0,  unit: 'strip' },
            { name: 'Itopride 150mg (Strip 10)',        qty: 1, unitPrice: 78.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Anjali Bose', date: daysAgo(96, 18), amount: 180.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 1, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Mohit Agarwal', date: daysAgo(95, 8), amount: 720.0,
        items: [
            { name: 'Amlodipine 5mg (Strip 15)',        qty: 2, unitPrice: 42.0,  unit: 'strip' },
            { name: 'Losartan 50mg (Strip 15)',         qty: 2, unitPrice: 68.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 3, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',       qty: 3, unitPrice: 28.0,  unit: 'strip' },
            { name: 'Clopidogrel 75mg (Strip 15)',      qty: 2, unitPrice: 92.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Seema Rao', date: daysAgo(93, 11), amount: 390.0,
        items: [
            { name: 'Levothyroxine 50mcg (Strip 30)',   qty: 1, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Calcium + Vit D3 Tab (Strip 15)', qty: 2, unitPrice: 68.0,  unit: 'strip' },
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4, unitPrice: 42.0,  unit: 'sachet' },
        ]
    },
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(91, 10), amount: 1240.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',   qty: 4,  unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 3,  unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',  qty: 2,  unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2,  unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',      qty: 2,  unitPrice: 28.0,  unit: 'strip' },
        ]
    },

    // ── 90–80 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Fatima Shaikh', date: daysAgo(89, 20), amount: 230.0,
        items: [
            { name: 'ORS Sachet Orange Flavour',       qty: 6, unitPrice: 15.0, unit: 'sachet' },
            { name: 'Ondansetron 4mg (Strip of 10)',   qty: 2, unitPrice: 55.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(88, 10), amount: 420.0,
        items: [
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4,  unitPrice: 42.0, unit: 'sachet' },
            { name: 'Calcium + Vit D3 Tab (Strip 15)',  qty: 3,  unitPrice: 68.0, unit: 'strip' },
            { name: 'Iron + Folic Acid (Strip 30)',     qty: 1,  unitPrice: 85.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Vikram Singh', date: daysAgo(87, 19), amount: 310.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Levocetirizine 5mg (Strip of 10)',qty: 2, unitPrice: 42.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 1, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Kiran Patel', date: daysAgo(85, 8), amount: 580.0,
        items: [
            { name: 'Amoxicillin 500mg (Strip of 10)', qty: 2, unitPrice: 88.0, unit: 'strip' },
            { name: 'Dolo 650 (Strip of 15)',          qty: 3, unitPrice: 30.0, unit: 'strip' },
            { name: 'Azithromycin 500mg (Strip of 3)', qty: 2, unitPrice: 85.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Ravi Kapoor', date: daysAgo(84, 11), amount: 560.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 1, unitPrice: 380.0, unit: 'pen' },
            { name: 'Glucometer Test Strips (25 pcs)', qty: 1, unitPrice: 180.0, unit: 'box' },
        ]
    },
    {
        merchant: 'Neeraj Kumar', date: daysAgo(82, 16), amount: 450.0,
        items: [
            { name: 'Pantoprazole 40mg (Strip 15)',    qty: 3, unitPrice: 58.0,  unit: 'strip' },
            { name: 'Metoclopramide 10mg (Strip 10)',  qty: 2, unitPrice: 32.0,  unit: 'strip' },
            { name: 'Sucralfate Syrup 100ml',          qty: 1, unitPrice: 88.0,  unit: 'bottle' },
        ]
    },

    // ── 80–70 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(79, 10), amount: 1300.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',    qty: 4, unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',    qty: 3, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',   qty: 2, unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2,  unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',       qty: 2, unitPrice: 28.0,  unit: 'strip' },
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4, unitPrice: 42.0,  unit: 'sachet' },
        ]
    },
    {
        merchant: 'Sunita Gupta', date: daysAgo(77, 9), amount: 285.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 1, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 1, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Meena Joshi', date: daysAgo(75, 17), amount: 660.0,
        items: [
            { name: 'Amlodipine 5mg (Strip 15)',        qty: 2, unitPrice: 42.0, unit: 'strip' },
            { name: 'Losartan 50mg (Strip 15)',         qty: 2, unitPrice: 68.0, unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2, unitPrice: 62.0, unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',       qty: 2, unitPrice: 28.0, unit: 'strip' },
            { name: 'Clopidogrel 75mg (Strip 15)',      qty: 2, unitPrice: 92.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Anjali Bose', date: daysAgo(73, 18), amount: 175.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 1, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Deepa Iyer', date: daysAgo(71, 9), amount: 390.0,
        items: [
            { name: 'Levothyroxine 50mcg (Strip 30)',  qty: 1, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Calcium + Vit D3 Tab (Strip 15)',qty: 3,  unitPrice: 68.0,  unit: 'strip' },
            { name: 'Methylcobalamin B12 (Strip 10)', qty: 2,  unitPrice: 52.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Farid Khan', date: daysAgo(70, 14), amount: 780.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 1, unitPrice: 380.0, unit: 'pen' },
            { name: 'Glucometer Test Strips (25 pcs)', qty: 1, unitPrice: 180.0, unit: 'box' },
            { name: 'Metformin 500mg (Strip of 15)',   qty: 3, unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 1, unitPrice: 55.0,  unit: 'strip' },
        ]
    },

    // ── 70–60 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Varun Sharma', date: daysAgo(68, 19), amount: 350.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 3, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 2, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 2, unitPrice: 95.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Neeraj Kumar', date: daysAgo(66, 16), amount: 520.0,
        items: [
            { name: 'Omeprazole 20mg (Strip of 15)',   qty: 3, unitPrice: 38.0, unit: 'strip' },
            { name: 'Pantoprazole 40mg (Strip 15)',    qty: 3, unitPrice: 58.0, unit: 'strip' },
            { name: 'Domperidone 10mg (Strip of 10)',  qty: 2, unitPrice: 32.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(64, 10), amount: 1240.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',   qty: 4, unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 3, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',  qty: 2, unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',      qty: 2, unitPrice: 28.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Pooja Desai', date: daysAgo(62, 11), amount: 480.0,
        items: [
            { name: 'Azithromycin 500mg (Strip of 3)', qty: 2, unitPrice: 85.0, unit: 'strip' },
            { name: 'Dolo 650 (Strip of 15)',          qty: 3, unitPrice: 30.0, unit: 'strip' },
            { name: 'Levocetirizine 5mg (Strip of 10)',qty: 2, unitPrice: 42.0, unit: 'strip' },
            { name: 'Vitamin C 500mg (Strip 10)',      qty: 2, unitPrice: 38.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Ravi Kapoor', date: daysAgo(61, 11), amount: 740.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 2, unitPrice: 380.0, unit: 'pen' },
        ]
    },

    // ── 60–50 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Sunita Gupta', date: daysAgo(59, 9), amount: 260.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 2, unitPrice: 35.0, unit: 'strip' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 1, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Mohit Agarwal', date: daysAgo(57, 8), amount: 710.0,
        items: [
            { name: 'Amlodipine 5mg (Strip 15)',        qty: 2, unitPrice: 42.0,  unit: 'strip' },
            { name: 'Losartan 50mg (Strip 15)',         qty: 2, unitPrice: 68.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 3, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Clopidogrel 75mg (Strip 15)',      qty: 2, unitPrice: 92.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Fatima Shaikh', date: daysAgo(55, 20), amount: 280.0,
        items: [
            { name: 'ORS Sachet Orange Flavour',       qty: 8,  unitPrice: 15.0, unit: 'sachet' },
            { name: 'Ondansetron 4mg (Strip of 10)',   qty: 2,  unitPrice: 55.0, unit: 'strip' },
            { name: 'Norfloxacin 400mg (Strip of 10)', qty: 1, unitPrice: 72.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Arjun Reddy', date: daysAgo(53, 14), amount: 395.0,
        items: [
            { name: 'Montelukast 10mg (Strip 15)',      qty: 2, unitPrice: 88.0, unit: 'strip' },
            { name: 'Levosalbutamol Inhaler 50mcg',    qty: 1, unitPrice: 145.0, unit: 'inhaler' },
            { name: 'Budesonide Inhaler 200mcg',       qty: 1, unitPrice: 160.0, unit: 'inhaler' },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(51, 10), amount: 380.0,
        items: [
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4, unitPrice: 42.0, unit: 'sachet' },
            { name: 'Calcium + Vit D3 Tab (Strip 15)', qty: 3,  unitPrice: 68.0, unit: 'strip' },
        ]
    },

    // ── 50–40 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(49, 10), amount: 1350.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',    qty: 4, unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',    qty: 3, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',   qty: 2, unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)',  qty: 2, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',       qty: 2, unitPrice: 28.0,  unit: 'strip' },
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4, unitPrice: 42.0,  unit: 'sachet' },
            { name: 'Glucometer Test Strips (25 pcs)',  qty: 1, unitPrice: 180.0, unit: 'box' },
        ]
    },
    {
        merchant: 'Vikram Singh', date: daysAgo(47, 19), amount: 420.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 3, unitPrice: 22.0, unit: 'strip' },
            { name: 'Levocetirizine 5mg (Strip of 10)',qty: 2, unitPrice: 42.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 2, unitPrice: 95.0, unit: 'bottle' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 2, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Seema Rao', date: daysAgo(45, 11), amount: 335.0,
        items: [
            { name: 'Levothyroxine 50mcg (Strip 30)',   qty: 1, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Methylcobalamin B12 (Strip 10)',   qty: 2, unitPrice: 52.0,  unit: 'strip' },
            { name: 'Iron + Folic Acid (Strip 30)',     qty: 1, unitPrice: 85.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Ravi Kapoor', date: daysAgo(44, 11), amount: 560.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 1, unitPrice: 380.0, unit: 'pen' },
            { name: 'Glucometer Test Strips (25 pcs)', qty: 1, unitPrice: 180.0, unit: 'box' },
        ]
    },
    {
        merchant: 'Neeraj Kumar', date: daysAgo(42, 16), amount: 520.0,
        items: [
            { name: 'Omeprazole 20mg (Strip of 15)',   qty: 3, unitPrice: 38.0, unit: 'strip' },
            { name: 'Pantoprazole 40mg (Strip 15)',    qty: 3, unitPrice: 58.0, unit: 'strip' },
            { name: 'Sucralfate Syrup 100ml',          qty: 1, unitPrice: 88.0, unit: 'bottle' },
        ]
    },

    // ── 40–30 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Anjali Bose', date: daysAgo(39, 18), amount: 210.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 2, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Kiran Patel', date: daysAgo(37, 8), amount: 580.0,
        items: [
            { name: 'Amoxicillin 500mg (Strip of 10)', qty: 2, unitPrice: 88.0, unit: 'strip' },
            { name: 'Dolo 650 (Strip of 15)',          qty: 3, unitPrice: 30.0, unit: 'strip' },
            { name: 'Azithromycin 500mg (Strip of 3)', qty: 2, unitPrice: 85.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(35, 10), amount: 1240.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',   qty: 4, unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 3, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',  qty: 2, unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',      qty: 2, unitPrice: 28.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Pooja Desai', date: daysAgo(33, 11), amount: 440.0,
        items: [
            { name: 'Azithromycin 500mg (Strip of 3)', qty: 2, unitPrice: 85.0, unit: 'strip' },
            { name: 'Dolo 650 (Strip of 15)',          qty: 3, unitPrice: 30.0, unit: 'strip' },
            { name: 'Vitamin C 500mg (Strip 10)',      qty: 3, unitPrice: 38.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Arjun Reddy', date: daysAgo(31, 14), amount: 305.0,
        items: [
            { name: 'Montelukast 10mg (Strip 15)',     qty: 2, unitPrice: 88.0,  unit: 'strip' },
            { name: 'Budesonide Inhaler 200mcg',       qty: 1, unitPrice: 160.0, unit: 'inhaler' },
        ]
    },

    // ── 30–20 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Fatima Shaikh', date: daysAgo(28, 20), amount: 195.0,
        items: [
            { name: 'ORS Sachet Orange Flavour',       qty: 5, unitPrice: 15.0, unit: 'sachet' },
            { name: 'Ondansetron 4mg (Strip of 10)',   qty: 2, unitPrice: 55.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Ravi Kapoor', date: daysAgo(27, 11), amount: 740.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 2, unitPrice: 380.0, unit: 'pen' },
        ]
    },
    {
        merchant: 'Mohit Agarwal', date: daysAgo(25, 8), amount: 660.0,
        items: [
            { name: 'Amlodipine 5mg (Strip 15)',        qty: 2, unitPrice: 42.0,  unit: 'strip' },
            { name: 'Losartan 50mg (Strip 15)',         qty: 2, unitPrice: 68.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',       qty: 2, unitPrice: 28.0,  unit: 'strip' },
            { name: 'Clopidogrel 75mg (Strip 15)',      qty: 2, unitPrice: 92.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Sunita Gupta', date: daysAgo(23, 9), amount: 280.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 1, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 1, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Meena Joshi', date: daysAgo(21, 17), amount: 395.0,
        items: [
            { name: 'Amlodipine 5mg (Strip 15)',       qty: 2, unitPrice: 42.0,  unit: 'strip' },
            { name: 'Losartan 50mg (Strip 15)',        qty: 2, unitPrice: 68.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)',qty: 2,  unitPrice: 62.0,  unit: 'strip' },
        ]
    },

    // ── 20–10 days ago ───────────────────────────────────────────────────────
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(20, 10), amount: 1300.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',   qty: 4, unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 3, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',  qty: 2, unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',      qty: 2, unitPrice: 28.0,  unit: 'strip' },
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4, unitPrice: 42.0, unit: 'sachet' },
        ]
    },
    {
        merchant: 'Deepa Iyer', date: daysAgo(18, 9), amount: 445.0,
        items: [
            { name: 'Levothyroxine 50mcg (Strip 30)',  qty: 1, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Calcium + Vit D3 Tab (Strip 15)',qty: 3,  unitPrice: 68.0,  unit: 'strip' },
            { name: 'Methylcobalamin B12 (Strip 10)', qty: 2,  unitPrice: 52.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Kiran Patel', date: daysAgo(16, 8), amount: 670.0,
        items: [
            { name: 'Amoxicillin 500mg (Strip of 10)', qty: 3, unitPrice: 88.0, unit: 'strip' },
            { name: 'Azithromycin 500mg (Strip of 3)', qty: 2, unitPrice: 85.0, unit: 'strip' },
            { name: 'Dolo 650 (Strip of 15)',          qty: 3, unitPrice: 30.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Varun Sharma', date: daysAgo(14, 19), amount: 450.0,
        items: [
            { name: 'Montelukast 10mg (Strip 15)',      qty: 2, unitPrice: 88.0,  unit: 'strip' },
            { name: 'Levosalbutamol Inhaler 50mcg',    qty: 1, unitPrice: 145.0, unit: 'inhaler' },
            { name: 'Budesonide Inhaler 200mcg',       qty: 1, unitPrice: 160.0, unit: 'inhaler' },
        ]
    },
    {
        merchant: 'Neeraj Kumar', date: daysAgo(12, 16), amount: 500.0,
        items: [
            { name: 'Pantoprazole 40mg (Strip 15)',    qty: 3, unitPrice: 58.0, unit: 'strip' },
            { name: 'Omeprazole 20mg (Strip of 15)',   qty: 3, unitPrice: 38.0, unit: 'strip' },
            { name: 'Metoclopramide 10mg (Strip 10)',  qty: 2, unitPrice: 32.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Ravi Kapoor', date: daysAgo(11, 11), amount: 560.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 1, unitPrice: 380.0, unit: 'pen' },
            { name: 'Glucometer Test Strips (25 pcs)', qty: 1, unitPrice: 180.0, unit: 'box' },
        ]
    },

    // ── Last 10 days ─────────────────────────────────────────────────────────
    {
        merchant: 'Anjali Bose', date: daysAgo(9, 18), amount: 225.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 2, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 1, unitPrice: 95.0, unit: 'bottle' },
        ]
    },
    {
        merchant: 'Dr Sharma Clinic', date: daysAgo(7, 10), amount: 1360.0,
        items: [
            { name: 'Metformin 500mg (Strip of 15)',   qty: 4, unitPrice: 48.0,  unit: 'strip' },
            { name: 'Glimepiride 1mg (Strip of 10)',   qty: 3, unitPrice: 55.0,  unit: 'strip' },
            { name: 'Telmisartan 40mg (Strip of 14)',  qty: 2, unitPrice: 72.0,  unit: 'strip' },
            { name: 'Atorvastatin 10mg (Strip of 10)', qty: 2, unitPrice: 62.0,  unit: 'strip' },
            { name: 'Aspirin 75mg (Strip of 14)',      qty: 2, unitPrice: 28.0,  unit: 'strip' },
            { name: 'Glucometer Test Strips (25 pcs)', qty: 1, unitPrice: 180.0, unit: 'box' },
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4, unitPrice: 42.0, unit: 'sachet' },
        ]
    },
    {
        merchant: 'Priya Nair', date: daysAgo(5, 10), amount: 420.0,
        items: [
            { name: 'Vitamin D3 60K IU Sachet',         qty: 4, unitPrice: 42.0, unit: 'sachet' },
            { name: 'Calcium + Vit D3 Tab (Strip 15)', qty: 3,  unitPrice: 68.0, unit: 'strip' },
            { name: 'Iron + Folic Acid (Strip 30)',     qty: 1,  unitPrice: 85.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Pooja Desai', date: daysAgo(3, 11), amount: 480.0,
        items: [
            { name: 'Azithromycin 500mg (Strip of 3)', qty: 2, unitPrice: 85.0, unit: 'strip' },
            { name: 'Dolo 650 (Strip of 15)',          qty: 3, unitPrice: 30.0, unit: 'strip' },
            { name: 'Levocetirizine 5mg (Strip of 10)',qty: 2, unitPrice: 42.0, unit: 'strip' },
            { name: 'Vitamin C 500mg (Strip 10)',      qty: 3, unitPrice: 38.0, unit: 'strip' },
        ]
    },
    {
        merchant: 'Farid Khan', date: daysAgo(2, 14), amount: 820.0,
        items: [
            { name: 'Insulin Glargine Pen 3ml',        qty: 2, unitPrice: 380.0, unit: 'pen' },
            { name: 'Metformin 500mg (Strip of 15)',   qty: 1, unitPrice: 48.0,  unit: 'strip' },
        ]
    },
    {
        merchant: 'Vikram Singh', date: daysAgo(1, 19), amount: 340.0,
        items: [
            { name: 'Paracetamol 500mg (Strip of 15)', qty: 2, unitPrice: 22.0, unit: 'strip' },
            { name: 'Cetirizine 10mg (Strip of 10)',   qty: 2, unitPrice: 35.0, unit: 'strip' },
            { name: 'Grilinctus Cough Syrup 100ml',    qty: 2, unitPrice: 95.0, unit: 'bottle' },
            { name: 'Nasivion Nasal Drops 10ml',       qty: 1, unitPrice: 72.0, unit: 'bottle' },
        ]
    },
];

// ── Stock Items ───────────────────────────────────────────────────────────────
const STOCK_ITEMS = [
    // Fever / Cold / Flu OTC
    { product_name: 'Paracetamol 500mg (Strip of 15)',  quantity: 120, unit: 'strip' },
    { product_name: 'Dolo 650 (Strip of 15)',           quantity: 80,  unit: 'strip' },
    { product_name: 'Cetirizine 10mg (Strip of 10)',    quantity: 90,  unit: 'strip' },
    { product_name: 'Levocetirizine 5mg (Strip of 10)',quantity: 60,   unit: 'strip' },
    { product_name: 'Grilinctus Cough Syrup 100ml',    quantity: 45,  unit: 'bottle' },
    { product_name: 'Nasivion Nasal Drops 10ml',       quantity: 35,  unit: 'bottle' },
    // Antibiotics
    { product_name: 'Azithromycin 500mg (Strip of 3)', quantity: 40,  unit: 'strip' },
    { product_name: 'Amoxicillin 500mg (Strip of 10)', quantity: 35,  unit: 'strip' },
    { product_name: 'Norfloxacin 400mg (Strip of 10)', quantity: 25,  unit: 'strip' },
    // Diabetes
    { product_name: 'Metformin 500mg (Strip of 15)',   quantity: 200, unit: 'strip' },
    { product_name: 'Glimepiride 1mg (Strip of 10)',   quantity: 100, unit: 'strip' },
    { product_name: 'Insulin Glargine Pen 3ml',        quantity: 15,  unit: 'pen'   },
    { product_name: 'Glucometer Test Strips (25 pcs)', quantity: 30,  unit: 'box'   },
    // Cardiac / Hypertension
    { product_name: 'Telmisartan 40mg (Strip of 14)',  quantity: 80,  unit: 'strip' },
    { product_name: 'Amlodipine 5mg (Strip 15)',       quantity: 70,  unit: 'strip' },
    { product_name: 'Losartan 50mg (Strip 15)',        quantity: 60,  unit: 'strip' },
    { product_name: 'Atorvastatin 10mg (Strip of 10)',quantity: 90,   unit: 'strip' },
    { product_name: 'Aspirin 75mg (Strip of 14)',      quantity: 100, unit: 'strip' },
    { product_name: 'Clopidogrel 75mg (Strip 15)',     quantity: 50,  unit: 'strip' },
    // Acidity / GI
    { product_name: 'Omeprazole 20mg (Strip of 15)',   quantity: 90,  unit: 'strip' },
    { product_name: 'Pantoprazole 40mg (Strip 15)',    quantity: 85,  unit: 'strip' },
    { product_name: 'Rabeprazole 20mg (Strip of 10)',  quantity: 40,  unit: 'strip' },
    { product_name: 'Domperidone 10mg (Strip of 10)',  quantity: 55,  unit: 'strip' },
    { product_name: 'Sucralfate Syrup 100ml',          quantity: 20,  unit: 'bottle' },
    { product_name: 'Metoclopramide 10mg (Strip 10)',  quantity: 30,  unit: 'strip' },
    { product_name: 'Itopride 150mg (Strip 10)',       quantity: 20,  unit: 'strip' },
    // Gastro
    { product_name: 'ORS Sachet Orange Flavour',       quantity: 200, unit: 'sachet' },
    { product_name: 'Ondansetron 4mg (Strip of 10)',   quantity: 45,  unit: 'strip' },
    // Supplements
    { product_name: 'Vitamin D3 60K IU Sachet',        quantity: 150, unit: 'sachet' },
    { product_name: 'Calcium + Vit D3 Tab (Strip 15)', quantity: 80,  unit: 'strip' },
    { product_name: 'Methylcobalamin B12 (Strip 10)',  quantity: 60,  unit: 'strip' },
    { product_name: 'Iron + Folic Acid (Strip 30)',    quantity: 40,  unit: 'strip' },
    { product_name: 'Vitamin C 500mg (Strip 10)',      quantity: 55,  unit: 'strip' },
    // Thyroid
    { product_name: 'Levothyroxine 50mcg (Strip 30)',  quantity: 30,  unit: 'strip' },
    // Respiratory / Asthma
    { product_name: 'Montelukast 10mg (Strip 15)',     quantity: 35,  unit: 'strip' },
    { product_name: 'Levosalbutamol Inhaler 50mcg',   quantity: 15,  unit: 'inhaler' },
    { product_name: 'Budesonide Inhaler 200mcg',      quantity: 12,  unit: 'inhaler' },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
    try {
        log('\n🏥 Seeding Test User Medicine...', bold);

        // ── 1. Upsert user ──────────────────────────────────────────────────
        log('\n👤 Creating / resetting user...', blue);
        const hash = await bcrypt.hash(PASSWORD, 10);

        const { rows: existing } = await pool.query(
            'SELECT id FROM users WHERE name = $1', [USER_NAME]
        );
        let userId;
        if (existing.length > 0) {
            userId = existing[0].id;
            await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
            log(`  ✅ User already exists — password reset (ID: ${userId})`, yellow);
        } else {
            const { rows: [newUser] } = await pool.query(
                'INSERT INTO users(name, password_hash) VALUES($1,$2) RETURNING id',
                [USER_NAME, hash]
            );
            userId = newUser.id;
            log(`  ✅ Created user ${USER_NAME} (ID: ${userId})`, green);
        }

        // ── 2. Ensure pharmacy store ────────────────────────────────────────
        log('\n🏪 Checking store...', blue);
        const { rows: storeRows } = await pool.query(
            'SELECT id FROM stores WHERE user_id = $1 LIMIT 1', [userId]
        );
        let storeId;
        if (storeRows.length === 0) {
            const { rows: [s] } = await pool.query(
                `INSERT INTO stores(user_id, name, region, type)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [userId, 'Arogya Medical Store', 'Mumbai', 'pharmacy']
            );
            storeId = s.id;
            log(`  ✅ Created store: Arogya Medical Store (ID: ${storeId})`, green);
        } else {
            storeId = storeRows[0].id;
            await pool.query(
                `UPDATE stores SET name = 'Arogya Medical Store', type = 'pharmacy', region = 'Mumbai'
                 WHERE id = $1`, [storeId]
            );
            log(`  ✅ Using existing store (ID: ${storeId})`, yellow);
        }

        // ── 3. Clear existing data ──────────────────────────────────────────
        log('\n🧹 Clearing existing data...', blue);
        await pool.query('DELETE FROM ai_insights             WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM shop_memory             WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM product_relationships   WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM experience_insights     WHERE store_id = $1', [storeId]);
        await pool.query('DELETE FROM stock_items             WHERE user_id  = $1', [userId]);
        await pool.query('DELETE FROM order_items             WHERE user_id  = $1', [userId]);
        const { rows: existingLedger } = await pool.query(
            'SELECT id FROM ledger_entries WHERE user_id = $1', [userId]
        );
        if (existingLedger.length > 0) {
            const ids = existingLedger.map(r => r.id);
            await pool.query('DELETE FROM line_items WHERE ledger_entry_id = ANY($1)', [ids]);
        }
        await pool.query('DELETE FROM ledger_entries WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM bills           WHERE user_id = $1', [userId]);
        log('  ✅ Cleared', green);

        // ── 4. Insert transactions ──────────────────────────────────────────
        log(`\n📦 Inserting ${TRANSACTIONS.length} transactions...`, blue);
        const ledgerIds = [];

        for (const [i, tx] of TRANSACTIONS.entries()) {
            const { rows: [bill] } = await pool.query(
                `INSERT INTO bills(user_id, store_id, source, status, created_at)
                 VALUES ($1,$2,'manual','COMPLETED',$3) RETURNING id`,
                [userId, storeId, tx.date]
            );
            const { rows: [ledger] } = await pool.query(
                `INSERT INTO ledger_entries
                   (user_id,store_id,bill_id,merchant,transaction_date,total_amount,transaction_type,created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,'income',$5) RETURNING id`,
                [userId, storeId, bill.id, tx.merchant, tx.date, tx.amount]
            );
            for (const item of tx.items) {
                await pool.query(
                    `INSERT INTO line_items(ledger_entry_id,product_name,quantity,unit_price,total_price,unit)
                     VALUES($1,$2,$3,$4,$5,$6)`,
                    [ledger.id, item.name, item.qty, item.unitPrice, item.qty * item.unitPrice, item.unit || 'units']
                );
            }
            ledgerIds.push(ledger.id);
            process.stdout.write(`  ✅ Tx ${i + 1}/${TRANSACTIONS.length}: ${tx.merchant} ₹${tx.amount}\n`);
        }

        // ── 5. Seed stock ───────────────────────────────────────────────────
        log(`\n📊 Seeding ${STOCK_ITEMS.length} stock items...`, blue);
        for (const item of STOCK_ITEMS) {
            await pool.query(
                `INSERT INTO stock_items(user_id,store_id,product_name,quantity,unit)
                 VALUES($1,$2,$3,$4,$5)
                 ON CONFLICT (store_id, product_name) DO UPDATE
                 SET quantity = EXCLUDED.quantity, unit = EXCLUDED.unit`,
                [userId, storeId, item.product_name, item.quantity, item.unit]
            );
        }
        log('  ✅ Stock seeded', green);

        // ── 6. RAG learning ─────────────────────────────────────────────────
        log('\n🧠 Running RAG learning...', blue);
        let learned = 0;
        for (const ledgerId of ledgerIds) {
            try { await learnFromNewTransaction(ledgerId); learned++; }
            catch (e) { log(`  ⚠️  Skipped ${ledgerId}: ${e.message}`, yellow); }
        }
        log(`  ✅ Learned from ${learned}/${ledgerIds.length} transactions`, green);

        // ── 7. Relationship discovery ───────────────────────────────────────
        log('\n🔗 Discovering product relationships...', blue);
        try {
            const rels = await discoverProductRelationships(storeId, 120);
            log(`  ✅ Discovered ${rels.length} relationships`, green);
        } catch (e) { log(`  ⚠️  ${e.message}`, yellow); }

        // ── 8. Experience insights ──────────────────────────────────────────
        log('\n💡 Generating experience insights...', blue);
        try {
            const insights = await generateExperienceInsights(storeId);
            log(`  ✅ Generated ${insights.length} insights`, green);
        } catch (e) { log(`  ⚠️  ${e.message}`, yellow); }

        // ── 9. Summary ──────────────────────────────────────────────────────
        log('\n════════════════════════════════════════════════', cyan);
        log('  Done! Summary', bold);
        log('════════════════════════════════════════════════', cyan);

        const [memCount, relCount, insightCount, ledgerCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM shop_memory           WHERE store_id = $1', [storeId]),
            pool.query('SELECT COUNT(*) FROM product_relationships WHERE store_id = $1', [storeId]),
            pool.query('SELECT COUNT(*) FROM experience_insights   WHERE store_id = $1', [storeId]),
            pool.query('SELECT COUNT(*) FROM ledger_entries        WHERE user_id  = $1', [userId]),
        ]);

        log(`  User         : ${USER_NAME}`, green);
        log(`  Password     : ${PASSWORD}  (bcrypt hashed)`, green);
        log(`  Store        : Arogya Medical Store (ID: ${storeId})`, green);
        log(`  Transactions : ${ledgerCount.rows[0].count}`, green);
        log(`  Shop Memory  : ${memCount.rows[0].count} rows`, green);
        log(`  Relationships: ${relCount.rows[0].count} rows`, green);
        log(`  Insights     : ${insightCount.rows[0].count} rows`, green);
        log('\n  🚀 Login with: testuser_medicine / medicine123', bold);
        log('════════════════════════════════════════════════\n', cyan);

    } catch (err) {
        log(`\n❌ Fatal: ${err.message}`, red);
        console.error(err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run();
