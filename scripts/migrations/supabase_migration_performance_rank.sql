-- ==========================================================
-- YBEX — PERFORMANCE RANK SYSTEM SQL MIGRATION
-- Adds performance tracking, scoring, and rating columns to public.deals
-- ==========================================================

ALTER TABLE public.deals 
ADD COLUMN IF NOT EXISTS promised_reach INTEGER DEFAULT 10000,
ADD COLUMN IF NOT EXISTS delivered_reach INTEGER,
ADD COLUMN IF NOT EXISTS delivered_reach_source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS delivered_reach_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS performance_score NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS performance_tier TEXT,
ADD COLUMN IF NOT EXISTS on_time_submission BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS brand_rating INTEGER;

-- Create an index to quickly fetch completed/verified deals sorted by performance
CREATE INDEX IF NOT EXISTS idx_deals_performance 
ON public.deals (campaign_id, performance_score DESC) 
WHERE delivered_reach_source != 'manual';
