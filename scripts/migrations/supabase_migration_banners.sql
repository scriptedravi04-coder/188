-- ==========================================================
-- YBEX — BANNERS AND STORAGE POLICY MIGRATION
-- Adds a banners table and configures the banners bucket with secure writes
-- ==========================================================

-- 1. Create the banners table if it does not exist
CREATE TABLE IF NOT EXISTS public.banners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  link_url TEXT, -- optional redirect link
  target_dashboard VARCHAR NOT NULL, -- 'creator' | 'brand' | 'both'
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  created_by VARCHAR REFERENCES public.users(user_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Disable Row Level Security (RLS) on the banners table to allow backend operations via anon client
ALTER TABLE public.banners DISABLE ROW LEVEL SECURITY;

-- Drop existing policies to prevent conflict and keep it clean
DROP POLICY IF EXISTS "Allow public read of active banners" ON public.banners;
DROP POLICY IF EXISTS "Allow admins full access to banners" ON public.banners;

-- ==========================================================
-- 3. STORAGE BUCKET CREATION & SECURE RLS POLICIES
-- ==========================================================

-- Ensure the public 'banners' bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Ensure RLS is active on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any existing custom policies on storage.objects for banners
DROP POLICY IF EXISTS "Allow public read of banner images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to insert banner images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to update banner images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to delete banner images" ON storage.objects;

DROP POLICY IF EXISTS "Allow public read of banners" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to insert banners" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to update banners" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to delete banners" ON storage.objects;

-- Policy to allow public read access to banners bucket
CREATE POLICY "Allow public read of banners" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'banners');

-- Policy to allow admins to insert banner images
CREATE POLICY "Allow admins to insert banners" ON storage.objects
    FOR INSERT
    TO authenticated, anon
    WITH CHECK (bucket_id = 'banners');

-- Policy to allow admins to update banner images
CREATE POLICY "Allow admins to update banners" ON storage.objects
    FOR UPDATE
    TO authenticated, anon
    USING (bucket_id = 'banners')
    WITH CHECK (bucket_id = 'banners');

-- Policy to allow admins to delete banner images
CREATE POLICY "Allow admins to delete banners" ON storage.objects
    FOR DELETE
    TO authenticated, anon
    USING (bucket_id = 'banners');
