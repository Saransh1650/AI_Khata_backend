'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const env = require('./config/env');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: env.allowedOrigins }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded bill images statically
const uploadDir = path.resolve(env.uploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', require('./auth/routes'));
app.use('/stores', require('./stores/routes'));
app.use('/bills', require('./bills/routes'));
app.use('/ledger', require('./ledger/routes'));
app.use('/analytics', require('./analytics/routes'));
app.use('/ai', require('./ai/routes'));
app.use('/memory', require('./ai/ragMemoryRoutes')); // RAG-driven shop intelligence
app.use('/stocks', require('./stocks/routes'));
app.use('/order-items', require('./order_items/routes'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(env.port, () => {
    console.log(`🚀 AI Khata backend running on port ${env.port}`);
    // Start the AI insights background scheduler (generates & caches Gemini responses)
    require('./ai/service').startInsightsScheduler();
});
