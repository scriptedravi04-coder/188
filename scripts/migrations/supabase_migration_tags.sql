-- ==========================================
-- UNIVERSAL CATEGORY & NICHE SEARCH MIGRATION
-- ==========================================

-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create tag_type enum if not exists
DO $$ BEGIN
    CREATE TYPE public.tag_type AS ENUM ('niche', 'skill', 'industry', 'target_category');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create tag_status enum if not exists
DO $$ BEGIN
    CREATE TYPE public.tag_status AS ENUM ('pending_validation', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create master_tags table
CREATE TABLE IF NOT EXISTS public.master_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    type public.tag_type NOT NULL,
    usage_count INT DEFAULT 1,
    status public.tag_status DEFAULT 'pending_validation',
    rejection_reason TEXT,
    merged_into UUID REFERENCES public.master_tags(id) ON DELETE SET NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create entity_tags junction table
CREATE TABLE IF NOT EXISTS public.entity_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('creator_profile', 'brand_profile', 'campaign_brief')),
    entity_id VARCHAR(255) NOT NULL,
    tag_id UUID NOT NULL REFERENCES public.master_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (entity_type, entity_id, tag_id)
);

-- Create GIN index for fuzzy search
CREATE INDEX IF NOT EXISTS master_tags_name_trgm_idx ON public.master_tags USING gin (name gin_trgm_ops);

-- Trigger function to auto-increment usage_count in master_tags
CREATE OR REPLACE FUNCTION public.increment_master_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.master_tags
    SET usage_count = COALESCE(usage_count, 0) + 1
    WHERE id = NEW.tag_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on entity_tags
CREATE OR REPLACE TRIGGER trigger_increment_tag_usage
AFTER INSERT ON public.entity_tags
FOR EACH ROW
EXECUTE FUNCTION public.increment_master_tag_usage();
