'use strict';

/**
 * Shared utility — syncs stock_items inside an active DB transaction
 * after any bill (manual or OCR) is created.
 *
 * transactionType === 'expense'  (purchase)
 *   → INSERT or increment quantity for each line item.
 *
 * transactionType === 'income'   (sale)
 *   → Ensure the row exists (0 qty if brand-new), then decrement.
 *     GREATEST(0, qty - sold) prevents negative stock.
 *
 * @param {import('pg').PoolClient} client  Active PG client inside BEGIN/COMMIT
 * @param {string} userId
 * @param {string} storeId
 * @param {'income'|'expense'} transactionType
 * @param {Array<{name:string, qty:number, unit?:string}>} lineItems
 */
async function syncStockAfterBill(client, userId, storeId, transactionType, lineItems) {
    for (const item of (lineItems || [])) {
        const name = (item.name || '').trim();
        if (!name) continue;
        const qty = Number(item.qty) || 0;
        if (qty <= 0) continue;
        const unit = (item.unit || 'units').trim();

        if (transactionType === 'expense') {
            // Purchase → upsert, incrementing existing quantity
            await client.query(
                `INSERT INTO stock_items(user_id, store_id, product_name, quantity, unit, updated_at)
                 VALUES($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT(store_id, product_name)
                 DO UPDATE SET
                   quantity   = stock_items.quantity + $4,
                   updated_at = NOW()`,
                [userId, storeId, name, qty, unit]
            );
        } else {
            // Sale → guarantee the row exists first (DO NOTHING if already there),
            // then subtract from whatever stock is recorded.
            await client.query(
                `INSERT INTO stock_items(user_id, store_id, product_name, quantity, unit, updated_at)
                 VALUES($1, $2, $3, 0, $4, NOW())
                 ON CONFLICT(store_id, product_name) DO NOTHING`,
                [userId, storeId, name, unit]
            );
            await client.query(
                `UPDATE stock_items
                 SET quantity   = GREATEST(0, quantity - $1),
                     updated_at = NOW()
                 WHERE user_id = $2 AND store_id = $3 AND product_name = $4`,
                [qty, userId, storeId, name]
            );
        }
    }
}

module.exports = { syncStockAfterBill };
