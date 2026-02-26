'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');

// ── GET /ai/insights ──────────────────────────────────────────────────────────
// Returns cached AI insights from DB. No AI call. Triggers background refresh
// if insights are stale (>24h) or 20+ new ledger entries since last generation.
router.get('/insights', authenticate, async (req, res, next) => {
    try {
        const { storeId, storeType } = req.query;
        if (!storeId) return res.status(400).json({ error: 'storeId query param required' });

        // Check and trigger background refresh if needed (non-blocking)
        svc.checkAndRefreshIfNeeded(req.user.userId, storeId, storeType).catch(() => { });

        // Return whatever is cached (may be empty on first use)
        const insights = await svc.getInsights(req.user.userId, storeId);
        res.json({ insights });
    } catch (e) { next(e); }
});

// ── POST /ai/insights/refresh ─────────────────────────────────────────────────
// Forces an immediate background refresh. Returns immediately (non-blocking).
// The app should re-fetch GET /ai/insights after a delay when pull-to-refreshing.
router.post('/insights/refresh', authenticate, async (req, res, next) => {
    try {
        const { storeId, storeType } = req.body;
        if (!storeId) return res.status(400).json({ error: 'storeId required' });
        svc.triggerInsightsRefresh(req.user.userId, storeId, storeType);
        res.json({ message: 'Refresh queued. Check back in ~30 seconds.' });
    } catch (e) { next(e); }
});

// ── GET /ai/jobs/:id — kept for OCR bill processing ──────────────────────────
router.get('/jobs/:id', authenticate, async (req, res, next) => {
    try {
        const job = await svc.getJob(req.params.id, req.user.userId);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json({ job });
    } catch (e) { next(e); }
});

// ── GET /ai/jobs/:id/result — kept for OCR bill processing ───────────────────
router.get('/jobs/:id/result', authenticate, async (req, res, next) => {
    try {
        const data = await svc.getJobResult(req.params.id, req.user.userId);
        if (!data) return res.status(404).json({ error: 'Job not found' });
        res.json(data);
    } catch (e) { next(e); }
});

module.exports = router;
