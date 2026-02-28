'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');

// GET /order-items?storeId=X  — list all order items for the current user
router.get('/', authenticate, async (req, res, next) => {
    try {
        const items = await svc.list(req.user.userId, req.query.storeId || null);
        res.json({ items });
    } catch (e) { next(e); }
});

// POST /order-items  — add / upsert one item
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { storeId, name, unit, reason, qty } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required' });
        const item = await svc.upsert(req.user.userId, storeId || null, { name, unit, reason, qty });
        res.status(201).json({ item });
    } catch (e) { next(e); }
});

// PATCH /order-items/:id  — update qty and/or unit
router.patch('/:id', authenticate, async (req, res, next) => {
    try {
        const { qty, unit } = req.body;
        const item = await svc.update(req.params.id, req.user.userId, { qty, unit });
        if (!item) return res.status(404).json({ error: 'Order item not found' });
        res.json({ item });
    } catch (e) { next(e); }
});

// DELETE /order-items/:id  — remove one item
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const deleted = await svc.remove(req.params.id, req.user.userId);
        if (!deleted) return res.status(404).json({ error: 'Order item not found' });
        res.json({ success: true });
    } catch (e) { next(e); }
});

// DELETE /order-items?storeId=X  — clear the whole list (called after "Ordered — Update Stock")
router.delete('/', authenticate, async (req, res, next) => {
    try {
        await svc.clearAll(req.user.userId, req.query.storeId || null);
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = router;
