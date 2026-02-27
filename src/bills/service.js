'use strict';
const path = require('path');
const { Worker } = require('worker_threads');
const pool = require('../config/database');
const env = require('../config/env');

async function uploadBill(userId, storeId, file) {
    const imageUrl = `/uploads/${file.filename}`;
    const { rows: [bill] } = await pool.query(
        'INSERT INTO bills(user_id, store_id, image_url, source, status) VALUES($1,$2,$3,$2,$4) RETURNING *',
        [userId, storeId, imageUrl, 'ocr', 'UPLOADED']
    );

    // Kick off OCR worker asynchronously
    const worker = new Worker(path.join(__dirname, '../workers/ocrWorker.js'), {
        workerData: { billId: bill.id, imageUrl: path.resolve(env.uploadDir, file.filename) },
    });
    worker.on('error', (e) => console.error('OCR worker error', e));

    return bill;
}

async function createManualBill(userId, storeId, { merchant, date, total, transactionType = 'income', lineItems }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create a stub bill (no image)
        const { rows: [bill] } = await client.query(
            "INSERT INTO bills(user_id, store_id, source, status) VALUES($1,$2,'manual','COMPLETED') RETURNING *",
            [userId, storeId]
        );

        // Create ledger entry
        const { rows: [entry] } = await client.query(
            'INSERT INTO ledger_entries(user_id,store_id,bill_id,merchant,transaction_date,total_amount,transaction_type) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [userId, storeId, bill.id, merchant, new Date(date), total, transactionType]
        );

        // Create line items
        for (const item of (lineItems || [])) {
            await client.query(
                'INSERT INTO line_items(ledger_entry_id,product_name,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5)',
                [entry.id, item.name, item.qty, item.unitPrice, item.qty * item.unitPrice]
            );
        }

        await client.query('COMMIT');
        return { bill, entry };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getBills(userId, storeId) {
    const params = [userId];
    let q = 'SELECT * FROM bills WHERE user_id=$1';
    if (storeId) { params.push(storeId); q += ` AND store_id=$${params.length}`; }
    q += ' ORDER BY created_at DESC LIMIT 50';
    const { rows } = await pool.query(q, params);
    return rows;
}

async function getBill(billId, userId) {
    const { rows } = await pool.query('SELECT * FROM bills WHERE id=$1 AND user_id=$2', [billId, userId]);
    return rows[0] || null;
}

module.exports = { uploadBill, createManualBill, getBills, getBill };
