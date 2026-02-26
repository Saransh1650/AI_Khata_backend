'use strict';
const router = require('express').Router();
const svc = require('./service');

router.post('/register', async (req, res, next) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) return res.status(400).json({ error: 'name and password required' });
        const user = await svc.register({ name, password });
        res.status(201).json({ user });
    } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) return res.status(400).json({ error: 'name and password required' });
        const result = await svc.login({ name, password });
        res.json(result);
    } catch (e) { next(e); }
});

router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
        const result = await svc.refresh({ refreshToken });
        res.json(result);
    } catch (e) { next(e); }
});

module.exports = router;
