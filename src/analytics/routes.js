'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');

router.get('/sales-trends', authenticate, async (req, res, next) => {
    try {
        const { storeId, days } = req.query;
        const data = await svc.getSalesTrends(req.user.userId, { storeId, days });
        res.json({ data });
    } catch (e) { next(e); }
});

router.get('/product-rankings', authenticate, async (req, res, next) => {
    try {
        const { storeId, days, limit } = req.query;
        const data = await svc.getProductRankings(req.user.userId, { storeId, days, limit });
        res.json({ data });
    } catch (e) { next(e); }
});

router.get('/customer-activity', authenticate, async (req, res, next) => {
    try {
        const { storeId, days } = req.query;
        const data = await svc.getCustomerActivity(req.user.userId, { storeId, days });
        res.json({ data });
    } catch (e) { next(e); }
});

module.exports = router;
