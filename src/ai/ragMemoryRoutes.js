'use strict';
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { authenticate } = require('../auth/middleware');
const { generateMemoryBasedRecommendations, getProductExperience, getExperienceInsights } = require('./shopMemory');
const { generateSalesExpansionGuidance, getStrongRelationships } = require('./relationshipIntelligence');
const { initializeStoreMemory, checkMemoryHealth, cleanupMemory, batchLearnFromRecentTransactions } = require('./transactionLearner');
const { subscribeStore, unsubscribeStore } = require('./ragEventEmitter');
const pool = require('../config/database');
const env = require('../config/env');

// GET /memory/stream/:storeId?token=<jwt>
// Server-Sent Events stream of live RAG learning events for the dashboard
router.get('/stream/:storeId', async (req, res) => {
    const { storeId } = req.params;
    const { token } = req.query;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    let user;
    try { user = jwt.verify(token, env.jwtSecret); }
    catch (e) { return res.status(401).json({ error: 'Invalid or expired token' }); }
    const userId = user.userId || user.id;
    const { rows: stores } = await pool.query(
        'SELECT id, name FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]
    );
    if (stores.length === 0) return res.status(404).json({ error: 'Store not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const send = (eventType, data) => {
        res.write('event: ' + eventType + '\ndata: ' + JSON.stringify(data) + '\n\n');
    };

    try {
        const [health, products, rels, insights] = await Promise.all([
            checkMemoryHealth(storeId).catch(() => null),
            getProductExperience(storeId).catch(() => ({})),
            getStrongRelationships(storeId, 0.20).catch(() => []),
            getExperienceInsights(storeId).catch(() => [])
        ]);
        send('snapshot', { storeName: stores[0].name, health, products, relationships: rels, insights });
    } catch (err) { console.error('[RAG Stream] Snapshot error:', err); }

    const listener = (ev) => send(ev.type, ev);
    subscribeStore(storeId, listener);
    const hb = setInterval(() => send('heartbeat', { ts: new Date().toISOString() }), 25000);
    req.on('close', () => { clearInterval(hb); unsubscribeStore(storeId, listener); });
});

router.get('/recommendations/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        const { rows: inv } = await pool.query('SELECT product_name as product, quantity, unit FROM stock_items WHERE store_id = $1', [storeId]);
        res.json({ storeId, recommendations: await generateMemoryBasedRecommendations(storeId, inv), inventoryContext: inv.length, generatedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to generate recommendations' }); }
});

router.get('/expansion/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        const { rows: inv } = await pool.query('SELECT product_name as product, quantity, unit FROM stock_items WHERE store_id = $1', [storeId]);
        res.json({ storeId, salesExpansion: await generateSalesExpansionGuidance(storeId, inv), generatedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to generate expansion guidance' }); }
});

router.get('/products/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const { products } = req.query; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        const pl = products ? products.split(',').map(p => p.trim()) : [];
        const pe = await getProductExperience(storeId, pl);
        res.json({ storeId, productExperience: pe, requestedProducts: pl, totalProducts: Object.keys(pe).length, generatedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to get product experience' }); }
});

router.get('/relationships/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const { minStrength = 0.30, type } = req.query; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        const rels = await getStrongRelationships(storeId, parseFloat(minStrength));
        const fr = type ? rels.filter(r => r.relationship_type === type) : rels;
        const gr = fr.reduce((a, r) => { if (!a[r.relationship_type]) a[r.relationship_type] = []; a[r.relationship_type].push(r); return a; }, {});
        res.json({ storeId, relationships: gr, totalRelationships: fr.length, minStrength: parseFloat(minStrength), filterType: type || null, generatedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to get product relationships' }); }
});

router.get('/insights/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const { categories } = req.query; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        const cl = categories ? categories.split(',').map(c => c.trim()) : [];
        const ins = await getExperienceInsights(storeId, cl);
        const gi = ins.reduce((a, i) => { if (!a[i.insight_category]) a[i.insight_category] = []; a[i.insight_category].push(i); return a; }, {});
        res.json({ storeId, insights: gi, totalInsights: ins.length, requestedCategories: cl, generatedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to get experience insights' }); }
});

router.post('/initialize/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const { lookbackDays = 90, force = false } = req.body; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id, name FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        if (!force) {
            const { rows: em } = await pool.query('SELECT COUNT(*)::int as count FROM shop_memory WHERE store_id = $1', [storeId]);
            if (em[0].count > 0) return res.status(400).json({ error: 'Store memory already exists. Use force=true to rebuild.' });
        }
        const result = await initializeStoreMemory(userId, storeId, lookbackDays);
        res.json({ storeId, storeName: s[0].name, initialization: result, lookbackDays, completedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to initialize store memory' }); }
});

router.get('/health/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id, name FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        const health = await checkMemoryHealth(storeId);
        res.json({ storeId, storeName: s[0].name, memoryHealth: health, checkedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to check memory health' }); }
});

router.post('/cleanup/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const { maxAge = 180, minConfidence = 0.20 } = req.body; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        res.json({ storeId, cleanup: await cleanupMemory(storeId, maxAge, minConfidence), parameters: { maxAge, minConfidence }, completedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to cleanup memory' }); }
});

router.post('/learn/:storeId', authenticate, async (req, res) => {
    try {
        const { storeId } = req.params; const { days = 30 } = req.body; const userId = req.user.userId || req.user.id;
        const { rows: s } = await pool.query('SELECT id FROM stores WHERE id = $1 AND user_id = $2', [storeId, userId]);
        if (s.length === 0) return res.status(404).json({ error: 'Store not found' });
        const lc = await batchLearnFromRecentTransactions(userId, storeId, days);
        res.json({ storeId, learning: { transactionsProcessed: lc, lookbackDays: days }, completedAt: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: 'Failed to learn from transactions' }); }
});

module.exports = router;
