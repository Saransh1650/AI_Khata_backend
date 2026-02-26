'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');

router.post('/setup', authenticate, async (req, res, next) => {
    try {
        const { name, region, type } = req.body;
        if (!name) return res.status(400).json({ error: 'Store name required' });
        const store = await svc.setupStore(req.user.userId, { name, region, type });
        res.status(201).json({ store });
    } catch (e) { next(e); }
});

router.get('/', authenticate, async (req, res, next) => {
    try {
        const stores = await svc.getStores(req.user.userId);
        res.json({ stores });
    } catch (e) { next(e); }
});

router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const store = await svc.getStore(req.params.id, req.user.userId);
        if (!store) return res.status(404).json({ error: 'Store not found' });
        res.json({ store });
    } catch (e) { next(e); }
});

module.exports = router;
