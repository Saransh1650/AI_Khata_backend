-- AI Khata MVP — Database Schema
-- Run via: psql $DATABASE_URL -f src/config/init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stores
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  region VARCHAR(100),
  type VARCHAR(50) DEFAULT 'general' CHECK (type IN ('grocery','pharmacy','electronics','clothing','restaurant','general')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bills
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id),
  image_url TEXT,
  ocr_text TEXT,
  source VARCHAR(20) DEFAULT 'ocr' CHECK (source IN ('ocr','manual')),
  status VARCHAR(50) DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','PROCESSING','COMPLETED','FAILED')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Ledger Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id),
  bill_id UUID REFERENCES bills(id),
  merchant VARCHAR(255),
  transaction_date TIMESTAMP NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Line Items
CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id UUID REFERENCES ledger_entries(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL
);

-- AI Jobs
CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id),
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('forecast','inventory','festival','ocr')),
  config JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED')),
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- AI Results
CREATE TABLE IF NOT EXISTS ai_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ai_jobs(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  confidence DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_user_date ON ledger_entries(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_line_items_product ON line_items(product_name);
CREATE INDEX IF NOT EXISTS idx_bills_user_status ON bills(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user ON ai_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_user ON stores(user_id);
