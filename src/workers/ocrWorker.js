'use strict';
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const pool = require('../config/database');
const { callGemini } = require('../config/gemini');

async function run() {
    const { billId, imageUrl } = workerData;

    try {
        await pool.query("UPDATE bills SET status='PROCESSING' WHERE id=$1", [billId]);

        // Read image as base64
        const imageBuffer = fs.readFileSync(imageUrl);
        const base64 = imageBuffer.toString('base64');
        const mimeType = imageUrl.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' : 'image/png';

        const imagePart = { inlineData: { mimeType, data: base64 } };
        const prompt = `Extract all information from this bill/receipt. Return ONLY valid JSON with this exact structure:
{
  "merchant": "store name or null",
  "date": "YYYY-MM-DD or null",
  "total": 0.00,
  "lineItems": [
    { "name": "product name", "qty": 1, "unitPrice": 0.00, "total": 0.00 }
  ]
}
If a field is unclear, use null or 0. Do not include any text outside the JSON.`;

        const extracted = await callGemini(prompt, imagePart);

        // Fetch bill
        const { rows: [bill] } = await pool.query('SELECT * FROM bills WHERE id=$1', [billId]);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const txDate = extracted.date ? new Date(extracted.date) : new Date();
            const { rows: [entry] } = await client.query(
                `INSERT INTO ledger_entries(user_id,store_id,bill_id,merchant,transaction_date,total_amount)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
                [bill.user_id, bill.store_id, billId, extracted.merchant || 'Unknown', txDate, extracted.total || 0]
            );

            for (const item of (extracted.lineItems || [])) {
                await client.query(
                    'INSERT INTO line_items(ledger_entry_id,product_name,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5)',
                    [entry.id, item.name, item.qty || 1, item.unitPrice || 0, item.total || 0]
                );
            }

            await client.query("UPDATE bills SET status='COMPLETED', ocr_text=$2 WHERE id=$1", [billId, JSON.stringify(extracted)]);
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
