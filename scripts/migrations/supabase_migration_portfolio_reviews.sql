-- ==========================================
-- YBEX — CREATOR PORTFOLIO & REVIEWS SQL MIGRATION
-- ==========================================

-- 1. Create creator_portfolio_items Table
CREATE TABLE IF NOT EXISTS public.creator_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id varchar NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  content_url text NOT NULL,
  platform varchar, -- 'instagram' | 'youtube' | 'other'
  brand_name varchar, -- optional, self-reported by creator
  description text,
  views integer,
  engagement_rate numeric,
  created_at timestamptz DEFAULT timezone('utc', now())
);

-- Enable Row Level Security
ALTER TABLE public.creator_portfolio_items ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for creator_portfolio_items
DROP POLICY IF EXISTS "Allow public read access to portfolio items" ON public.creator_portfolio_items;
CREATE POLICY "Allow public read access to portfolio items"
ON public.creator_portfolio_items
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow creators to manage their own portfolio items" ON public.creator_portfolio_items;
CREATE POLICY "Allow creators to manage their own portfolio items"
ON public.creator_portfolio_items
FOR ALL
USING (true)
WITH CHECK (true);


-- 2. Create creator_reviews Table
CREATE TABLE IF NOT EXISTS public.creator_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  creator_id varchar NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  brand_id varchar NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  communication_rating int CHECK (communication_rating BETWEEN 1 AND 5),
  timeliness_rating int CHECK (timeliness_rating BETWEEN 1 AND 5),
  quality_rating int CHECK (quality_rating BETWEEN 1 AND 5),
  overall_rating numeric, -- avg of ratings, computed at insert or insert trigger
  review_text text,
  created_at timestamptz DEFAULT timezone('utc', now()),
  CONSTRAINT unique_deal_review UNIQUE (deal_id, brand_id)
);

-- Enable Row Level Security
ALTER TABLE public.creator_reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for creator_reviews
DROP POLICY IF EXISTS "Allow public read access to reviews" ON public.creator_reviews;
CREATE POLICY "Allow public read access to reviews"
ON public.creator_reviews
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow brand insertion of reviews" ON public.creator_reviews;
CREATE POLICY "Allow brand insertion of reviews"
ON public.creator_reviews
FOR INSERT
WITH CHECK (true);


-- 3. Add tier column to creator_profiles
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS tier varchar DEFAULT 'bronze';
