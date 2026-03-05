'use strict';
require('dotenv').config();

const env = {
  port: process.env.PORT || 3000,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/ai_khata',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_in_prod',
  jwtExpiresIn: '24h',
  refreshExpiresIn: '7d',
  awsRegion: process.env.AWS_REGION || 'ap-south-1',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
};

module.exports = env;
