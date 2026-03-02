-- AI Khata RAG Memory Schema
-- Shop Intelligence & Experience Storage
-- Run via: psql $DATABASE_URL -f src/config/rag_memory.sql

-- ── Shop Memory Core ─────────────────────────────────────────────────────────
-- Stores learned behavioral patterns about products in this specific shop
CREATE TABLE IF NOT EXISTS shop_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  memory_type VARCHAR(50) NOT NULL CHECK (memory_type IN (
    'product_behavior',    -- how specific products perform in this shop
    'product_relationship', -- what products are bought together
    'seasonal_pattern',    -- how shop responds to seasons/festivals
    'customer_behavior',   -- customer buying habits
    'operational_rhythm'   -- shop's operational patterns
  )),
  context VARCHAR(255) NOT NULL, -- product name, festival, day of week, etc.
  memory_data JSONB NOT NULL,    -- the actual learned patterns
  confidence DECIMAL(3,2) DEFAULT 0.50, -- how confident we are (0-1)
  frequency INTEGER DEFAULT 1,   -- how often this pattern occurred
  last_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one memory entry per type+context+store combination
  UNIQUE(store_id, memory_type, context)
);

-- ── Product Relationships ───────────────────────────────────────────────────
-- Tracks which products are frequently bought together
CREATE TABLE IF NOT EXISTS product_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  product_a VARCHAR(255) NOT NULL,
  product_b VARCHAR(255) NOT NULL,
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN (
    'frequently_together',  -- bought in same transaction often
    'sequential',          -- B often bought after A
    'complementary',       -- one triggers demand for other
    'seasonal_pair',       -- bought together during specific times
    'substitute'           -- customers choose A or B, rarely both
  )),
  strength DECIMAL(3,2) DEFAULT 0.50, -- relationship strength (0-1)
  occurrences INTEGER DEFAULT 1,
  context VARCHAR(255),              -- festival, season, etc.
  last_occurrence TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate relationships (A,B) same as (B,A) for most types
  UNIQUE(store_id, product_a, product_b, relationship_type, context)
);

-- ── Experience Insights ─────────────────────────────────────────────────────
-- Stores high-level learnings about shop behavior
CREATE TABLE IF NOT EXISTS experience_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  insight_category VARCHAR(50) NOT NULL CHECK (insight_category IN (
    'shop_identity',       -- what kind of shop this really is
    'customer_preference', -- what customers prefer from this shop
    'strength_product',    -- products that consistently perform well
    'opportunity_gap',     -- products that could perform well
    'seasonal_strength'    -- how shop responds to seasons/events
  )),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB,               -- supporting data for this insight
  confidence DECIMAL(3,2) DEFAULT 0.50,
  impact VARCHAR(50) DEFAULT 'medium' CHECK (impact IN ('low','medium','high')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(store_id, insight_category, title)
);

-- ── Memory Analytics ────────────────────────────────────────────────────────
-- Tracks how memory is being used and its effectiveness
CREATE TABLE IF NOT EXISTS memory_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES shop_memory(id) ON DELETE CASCADE,
  usage_type VARCHAR(50) NOT NULL CHECK (usage_type IN (
    'suggestion_used',     -- memory was used to generate suggestion
    'suggestion_ignored',  -- suggestion was generated but not followed
    'pattern_confirmed',   -- real behavior matched memory prediction
    'pattern_violated'     -- real behavior contradicted memory
  )),
  context JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Indexes for Performance ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shop_memory_store_type ON shop_memory(store_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_shop_memory_context ON shop_memory(context);
CREATE INDEX IF NOT EXISTS idx_shop_memory_confidence ON shop_memory(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_product_relationships_store ON product_relationships(store_id);
CREATE INDEX IF NOT EXISTS idx_product_relationships_products ON product_relationships(product_a, product_b);
CREATE INDEX IF NOT EXISTS idx_product_relationships_strength ON product_relationships(strength DESC);
CREATE INDEX IF NOT EXISTS idx_experience_insights_store ON experience_insights(store_id);
CREATE INDEX IF NOT EXISTS idx_experience_insights_category ON experience_insights(insight_category);
CREATE INDEX IF NOT EXISTS idx_memory_usage_store ON memory_usage(store_id);
CREATE INDEX IF NOT EXISTS idx_memory_usage_type ON memory_usage(usage_type);

-- ── Functions for Memory Management ─────────────────────────────────────────

-- Function to increment memory frequency when pattern is observed again
CREATE OR REPLACE FUNCTION increment_memory_frequency(
  p_store_id UUID,
  p_memory_type VARCHAR(50),
  p_context VARCHAR(255)
)
RETURNS void AS $$
BEGIN
  UPDATE shop_memory 
  SET 
    frequency = frequency + 1,
    confidence = LEAST(1.0, confidence + 0.05), -- gradually increase confidence
    last_seen = NOW(),
    updated_at = NOW()
  WHERE store_id = p_store_id 
    AND memory_type = p_memory_type 
    AND context = p_context;
END;
$$ LANGUAGE plpgsql;

-- Function to update product relationship strength
CREATE OR REPLACE FUNCTION update_relationship_strength(
  p_store_id UUID,
  p_product_a VARCHAR(255),
  p_product_b VARCHAR(255),
  p_relationship_type VARCHAR(50),
  p_context VARCHAR(255) DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO product_relationships (
    store_id, product_a, product_b, relationship_type, 
    strength, occurrences, context, last_occurrence
  )
  VALUES (
    p_store_id, p_product_a, p_product_b, p_relationship_type,
    0.20, 1, p_context, NOW()
  )
  ON CONFLICT (store_id, product_a, product_b, relationship_type, context)
  DO UPDATE SET
    strength = LEAST(1.0, product_relationships.strength + 0.10),
    occurrences = product_relationships.occurrences + 1,
    last_occurrence = NOW();
END;
$$ LANGUAGE plpgsql;