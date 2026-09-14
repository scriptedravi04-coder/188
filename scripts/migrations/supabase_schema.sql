-- ==========================================
-- SUPABASE SCHEMA MIGRATION SCRIPT
-- ==========================================

-- 1. Create Storage Buckets
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
insert into storage.buckets (id, name, public) values ('banners', 'banners', true);
insert into storage.buckets (id, name, public) values ('kyc-documents', 'kyc-documents', false);
insert into storage.buckets (id, name, public) values ('content-submissions', 'content-submissions', false);
insert into storage.buckets (id, name, public) values ('live-proofs', 'live-proofs', false);
insert into storage.buckets (id, name, public) values ('ugc-assets', 'ugc-assets', false);

-- 2. Create Base Tables
CREATE TABLE public.users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    password_hash TEXT,
    role TEXT,
    picture TEXT,
    auth_method TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    onboarded BOOLEAN DEFAULT false
);

CREATE TABLE public.user_sessions (
    session_token TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.users(user_id),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.creator_profiles (
    user_id TEXT PRIMARY KEY REFERENCES public.users(user_id),
    city TEXT,
    state TEXT,
    bio TEXT,
    categories JSONB,
    languages JSONB,
    gender TEXT,
    creator_type TEXT,
    barter TEXT,
    rate_reel NUMERIC,
    rate_story NUMERIC,
    rate_yt_video NUMERIC,
    ig_followers NUMERIC,
    yt_subscribers NUMERIC,
    profile_photo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.brand_profiles (
    user_id TEXT PRIMARY KEY REFERENCES public.users(user_id),
    company_name TEXT,
    industry TEXT,
    website TEXT,
    logo TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.campaigns (
    campaign_id TEXT PRIMARY KEY,
    brand_user_id TEXT REFERENCES public.users(user_id),
    brand_name TEXT,
    brand_logo TEXT,
    title TEXT,
    budget_min NUMERIC,
    budget_max NUMERIC,
    deliverables JSONB,
    categories JSONB,
    platforms JSONB,
    language TEXT,
    status TEXT,
    deadline TEXT,
    description TEXT,
    target_audience TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.campaign_applications (
    application_id TEXT PRIMARY KEY,
    campaign_id TEXT REFERENCES public.campaigns(campaign_id),
    creator_id TEXT REFERENCES public.users(user_id),
    creator_name TEXT,
    creator_location TEXT,
    proposed_amount NUMERIC,
    pitch TEXT,
    status TEXT DEFAULT 'PENDING',
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    due_date TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(user_id),
    type TEXT,
    message TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.ugc_briefs (
    id TEXT PRIMARY KEY,
    brand_id TEXT REFERENCES public.users(user_id),
    title TEXT,
    product_name TEXT,
    product_description TEXT,
    budget NUMERIC,
    max_creators NUMERIC,
    claimed_count NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'OPEN',
    detailed_requirements TEXT,
    sample_content_url TEXT,
    dos JSONB,
    donts JSONB,
    deliverable_type TEXT,
    video_duration TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.ugc_orders (
    id TEXT PRIMARY KEY,
    brief_id TEXT REFERENCES public.ugc_briefs(id),
    brand_id TEXT REFERENCES public.users(user_id),
    creator_id TEXT REFERENCES public.users(user_id),
    status TEXT,
    creator_payout NUMERIC,
    video_url TEXT,
    thumbnail_url TEXT,
    creator_notes TEXT,
    payment_status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.reports (
    report_id TEXT PRIMARY KEY,
    reporter_user_id TEXT REFERENCES public.users(user_id),
    reporter_name TEXT,
    target_user_id TEXT REFERENCES public.users(user_id),
    target_name TEXT,
    type TEXT,
    description TEXT,
    severity TEXT,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.waves (
    wave_id TEXT PRIMARY KEY,
    from_user_id TEXT REFERENCES public.users(user_id),
    from_name TEXT,
    to_user_id TEXT REFERENCES public.users(user_id),
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.chat_threads (
    thread_id TEXT PRIMARY KEY,
    creator_id TEXT REFERENCES public.users(user_id),
    brand_id TEXT REFERENCES public.users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.chat_messages (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT REFERENCES public.chat_threads(thread_id),
    sender_user_id TEXT REFERENCES public.users(user_id),
    text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.message_flags (
    flag_id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES public.chat_messages(message_id),
    reporter_id TEXT REFERENCES public.users(user_id),
    reason TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- UNIVERSAL CATEGORY & NICHE SEARCH SCHEMA
-- ==========================================

-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create tag_type enum
CREATE TYPE public.tag_type AS ENUM ('niche', 'skill', 'industry', 'target_category');

-- Create tag_status enum
CREATE TYPE public.tag_status AS ENUM ('pending_validation', 'approved', 'rejected');

-- Create master_tags table
CREATE TABLE public.master_tags (
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
CREATE TABLE public.entity_tags (
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


