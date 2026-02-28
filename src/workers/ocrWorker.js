'use strict';
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const pool = require('../config/database');
const { callGemini } = require('../config/gemini');
const { syncStockAfterBill } = require('../utils/stockSync');

async function run() {
    const { billId, imageUrl } = workerData;

    try {
        await pool.query("UPDATE bills SET status='PROCESSING' WHERE id=$1", [billId]);

        // Read image as base64
        const imageBuffer = fs.readFileSync(imageUrl);
        const base64 = imageBuffer.toString('base64');
        const mimeType = imageUrl.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : 'image/png';

        const imagePart = { inlineData: { mimeType, data: base64 } };
        const prompt = `Extract all information from this bill/receipt.
Determine whether it is a purchase (money going OUT — you are buying goods) or a sale (money coming IN — you are selling goods).
Return ONLY valid JSON with this exact structure:
{
  "merchant": "store name or null",
  "date": "YYYY-MM-DD or null",
  "total": 0.00,
  "transactionType": "expense",
  "lineItems": [
    { "name": "product name", "qty": 1, "unitPrice": 0.00, "unit": "units", "total": 0.00 }
  ]
}
Rules:
- transactionType must be exactly "expense" (purchase/you paid) or "income" (sale/you received money). Default to "expense" if unclear.
- unit should be the item's unit of measure (kg, pcs, L, dozen, etc.). Use "units" if not specified.
- Do not include any text outside the JSON.`;

        const extracted = await callGemini(prompt, imagePart);

        // Fetch bill
        const { rows: [bill] } = await pool.query('SELECT * FROM bills WHERE id=$1', [billId]);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const txDate = extracted.date ? new Date(extracted.date) : new Date();
            const txType = ['income', 'expense'].includes(extracted.transactionType)
                ? extracted.transactionType
                : 'expense';

            const { rows: [entry] } = await client.query(
                `INSERT INTO ledger_entries(user_id,store_id,bill_id,merchant,transaction_date,total_amount,transaction_type)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                [bill.user_id, bill.store_id, billId, extracted.merchant || 'Unknown', txDate, extracted.total || 0, txType]
            );

            for (const item of (extracted.lineItems || [])) {
                await client.query(
                    'INSERT INTO line_items(ledger_entry_id,product_name,quantity,unit_price,total_price,unit) VALUES($1,$2,$3,$4,$5,$6)',
                    [entry.id, item.name, item.qty || 1, item.unitPrice || 0, item.total || 0, item.unit || 'units']
                );
            }

            await client.query("UPDATE bills SET status='COMPLETED', ocr_text=$2 WHERE id=$1", [billId, JSON.stringify(extracted)]);

            // Sync inventory inside the same transaction
            if (bill.store_id) {
                await syncStockAfterBill(client, bill.user_id, bill.store_id, txType, extracted.lineItems);
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('OCR Worker failed:', e.message);
        await pool.query("UPDATE bills SET status='FAILED' WHERE id=$1", [billId]);
    } finally {
        await pool.end();
        if (parentPort) parentPort.postMessage('done');
    }
}

run();
