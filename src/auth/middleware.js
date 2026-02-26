'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing token' });
    }
    try {
        req.user = jwt.verify(header.slice(7), env.jwtSecret);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { authenticate };
