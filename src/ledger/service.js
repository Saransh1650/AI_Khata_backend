'use strict';
const pool = require('../config/database');

async function getEntries(userId, { storeId, limit = 50, offset = 0 } = {}) {
    const params = [userId];
    let q = `SELECT le.*, json_agg(li.*) AS line_items
    FROM ledger_entries le
    LEFT JOIN line_items li ON li.ledger_entry_id = le.id
    WHERE le.user_id=$1`;
    if (storeId) { params.push(storeId); q += ` AND le.store_id=$${params.length}`; }
    q += ' GROUP BY le.id ORDER BY le.transaction_date DESC';
    params.push(limit, offset);
    q += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await pool.query(q, params);
    return rows;
}

async function getEntry(entryId, userId) {
    const { rows } = await pool.query(
        `SELECT le.*, json_agg(li.*) AS line_items
     FROM ledger_entries le
     LEFT JOIN line_items li ON li.ledger_entry_id = le.id
     WHERE le.id=$1 AND le.user_id=$2
     GROUP BY le.id`,
        [entryId, userId]
    );
    return rows[0] || null;
}

async function createEntry(userId, storeId, { merchant, transaction_date, total_amount, transaction_type = 'income', notes, lineItems }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [entry] } = await client.query(
            'INSERT INTO ledger_entries(user_id,store_id,merchant,transaction_date,total_amount,transaction_type,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [userId, storeId, merchant, transaction_date, total_amount, transaction_type, notes || '']
        );
        for (const item of (lineItems || [])) {
            await client.query(
                'INSERT INTO line_items(ledger_entry_id,product_name,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5)',
                [entry.id, item.product_name, item.quantity, item.unit_price, item.total_price]
            );
        }
        await client.query('COMMIT');
        return entry;
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function updateEntry(entryId, userId, fields) {
    const { merchant, transaction_date, total_amount, transaction_type = 'income', notes } = fields;
    const { rows } = await pool.query(
        `UPDATE ledger_entries SET merchant=$3, transaction_date=$4, total_amount=$5, transaction_type=$6, notes=$7, updated_at=NOW()
     WHERE id=$1 AND user_id=$2 RETURNING *`,
        [entryId, userId, merchant, transaction_date, total_amount, transaction_type, notes]
    );
    if (!rows.length) { const e = new Error('Not found'); e.status = 404; throw e; }
    return rows[0];
}

async function deleteEntry(entryId, userId) {
    const { rowCount } = await pool.query(
        'DELETE FROM ledger_entries WHERE id=$1 AND user_id=$2', [entryId, userId]
    );
    if (!rowCount) { const e = new Error('Not found'); e.status = 404; throw e; }
}

module.exports = { getEntries, getEntry, createEntry, updateEntry, deleteEntry };
