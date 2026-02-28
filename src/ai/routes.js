'use strict';
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');

// ── GET /ai/insights ──────────────────────────────────────────────────────────
// Pure DB read — returns whatever is cached. The scheduler (server-side only)
// is the only thing that triggers AI. The app has NO way to start an AI call.
router.get('/insights', authenticate, async (req, res, next) => {
    try {
        const { storeId } = req.query;
        if (!storeId) return res.status(400).json({ error: 'storeId query param required' });
        const insights = await svc.getInsights(req.user.userId, storeId);
        res.json({ insights });
    } catch (e) { next(e); }
});

// NOTE: POST /ai/insights/refresh intentionally removed.
// AI refresh is driven by the backend scheduler and the ledger-entry hook only.

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
