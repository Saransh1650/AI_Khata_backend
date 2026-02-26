'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');

// GET /stocks — list all stock items for the authenticated user's store
router.get('/', authenticate, async (req, res, next) => {
    try {
        const storeId = req.query.storeId || null;
        const items = await svc.listStock(req.user.userId, storeId);
        res.json({ items });
    } catch (e) { next(e); }
});

// POST /stocks — add or update a stock item (upsert by product_name within a store)
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { storeId, productName, quantity, unit, costPrice } = req.body;
        if (!productName) return res.status(400).json({ error: 'productName is required' });
        const item = await svc.upsertStockItem(req.user.userId, storeId, { productName, quantity, unit, costPrice });
        res.status(201).json({ item });
    } catch (e) { next(e); }
});

// PUT /stocks/:id — update an existing stock item
router.put('/:id', authenticate, async (req, res, next) => {
    try {
        const { quantity, unit, costPrice, productName } = req.body;
        const item = await svc.updateStockItem(req.params.id, req.user.userId, { quantity, unit, costPrice, productName });
        if (!item) return res.status(404).json({ error: 'Stock item not found' });
        res.json({ item });
    } catch (e) { next(e); }
});

// DELETE /stocks/:id — remove a stock item
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const deleted = await svc.deleteStockItem(req.params.id, req.user.userId);
        if (!deleted) return res.status(404).json({ error: 'Stock item not found' });
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = router;
