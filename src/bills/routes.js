'use strict';
const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../auth/middleware');
const svc = require('./service');
const env = require('../config/env');

const storage = multer.diskStorage({
    destination: path.resolve(env.uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /bills/upload — scan via OCR
router.post('/upload', authenticate, upload.single('image'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'image file required' });
        const storeId = req.body.storeId || null;
        const bill = await svc.uploadBill(req.user.userId, storeId, req.file);
        res.status(202).json({ bill, message: 'OCR processing started' });
    } catch (e) { next(e); }
});

// POST /bills/manual — manual entry
router.post('/manual', authenticate, async (req, res, next) => {
    try {
        const { storeId, merchant, date, total, transactionType, lineItems } = req.body;
        if (!merchant || !date || total == null) return res.status(400).json({ error: 'merchant, date, total required' });
        if (!Array.isArray(lineItems) || lineItems.length === 0) {
            return res.status(400).json({ error: 'at least one line item is required' });
        }
        const txType = ['income', 'expense'].includes(transactionType) ? transactionType : 'income';
        const result = await svc.createManualBill(req.user.userId, storeId, {
            merchant, date, total, transactionType: txType, lineItems,
        });
        res.status(201).json(result);
    } catch (e) { next(e); }
});

// GET /bills
router.get('/', authenticate, async (req, res, next) => {
    try {
        const bills = await svc.getBills(req.user.userId, req.query.storeId);
        res.json({ bills });
    } catch (e) { next(e); }
});

// GET /bills/:id
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const bill = await svc.getBill(req.params.id, req.user.userId);
        if (!bill) return res.status(404).json({ error: 'Not found' });
        res.json({ bill });
    } catch (e) { next(e); }
});

// GET /bills/:id/status
router.get('/:id/status', authenticate, async (req, res, next) => {
    try {
        const bill = await svc.getBill(req.params.id, req.user.userId);
        if (!bill) return res.status(404).json({ error: 'Not found' });
        res.json({ id: bill.id, status: bill.status });
    } catch (e) { next(e); }
});

module.exports = router;
