'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');

// POST /ai/forecast
router.post('/forecast', authenticate, async (req, res, next) => {
    try {
        const { storeId, horizon, storeType } = req.body;
        const job = await svc.requestForecast(req.user.userId, storeId, { horizon, storeType });
        res.status(202).json({ job, message: 'Forecast job queued' });
    } catch (e) { next(e); }
});

// POST /ai/inventory-analysis
router.post('/inventory-analysis', authenticate, async (req, res, next) => {
    try {
        const { storeId, storeType } = req.body;
        const job = await svc.requestInventoryAnalysis(req.user.userId, storeId, { storeType });
        res.status(202).json({ job, message: 'Inventory analysis job queued' });
    } catch (e) { next(e); }
});

// POST /ai/festival-recommendations (synchronous)
router.post('/festival-recommendations', authenticate, async (req, res, next) => {
    try {
        const { storeId, storeType } = req.body;
        const recommendations = await svc.getFestivalRecommendations(req.user.userId, storeId, storeType);
        res.json({ recommendations });
    } catch (e) { next(e); }
});

// GET /ai/jobs/:id
router.get('/jobs/:id', authenticate, async (req, res, next) => {
    try {
        const job = await svc.getJob(req.params.id, req.user.userId);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json({ job });
    } catch (e) { next(e); }
});

// GET /ai/jobs/:id/result
router.get('/jobs/:id/result', authenticate, async (req, res, next) => {
    try {
        const data = await svc.getJobResult(req.params.id, req.user.userId);
        if (!data) return res.status(404).json({ error: 'Job not found' });
        res.json(data);
    } catch (e) { next(e); }
});

module.exports = router;
