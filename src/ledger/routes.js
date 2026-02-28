'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');
const aiSvc = require('../ai/service');

router.get('/entries', authenticate, async (req, res, next) => {
    try {
        const { storeId, limit, offset } = req.query;
        const entries = await svc.getEntries(req.user.userId, { storeId, limit, offset });
        res.json({ entries });
    } catch (e) { next(e); }
});

router.post('/entries', authenticate, async (req, res, next) => {
    try {
        const { storeId, merchant, transaction_date, total_amount, notes, lineItems } = req.body;
        if (!transaction_date || !total_amount) return res.status(400).json({ error: 'transaction_date and total_amount required' });
        const entry = await svc.createEntry(req.user.userId, storeId, { merchant, transaction_date, total_amount, notes, lineItems });

        // Non-blocking: check if 20+ new bills have accumulated to justify a fresh AI run.
        // AI is never triggered from the advice page — only here or the scheduler.
        if (storeId) {
            aiSvc.checkAndRefreshIfNeeded(req.user.userId, storeId, null).catch(() => {});
        }

        res.status(201).json({ entry });
    } catch (e) { next(e); }
});

router.get('/entries/:id', authenticate, async (req, res, next) => {
    try {
        const entry = await svc.getEntry(req.params.id, req.user.userId);
        if (!entry) return res.status(404).json({ error: 'Not found' });
        res.json({ entry });
    } catch (e) { next(e); }
});

router.put('/entries/:id', authenticate, async (req, res, next) => {
    try {
        const entry = await svc.updateEntry(req.params.id, req.user.userId, req.body);
        res.json({ entry });
    } catch (e) { next(e); }
});

router.delete('/entries/:id', authenticate, async (req, res, next) => {
    try {
        await svc.deleteEntry(req.params.id, req.user.userId);
        res.json({ message: 'Deleted' });
    } catch (e) { next(e); }
});

module.exports = router;
