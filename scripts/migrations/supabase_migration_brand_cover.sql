-- ==========================================
-- SUPABASE SCHEMA MIGRATION SCRIPT
-- ==========================================

-- 1. Add `cover_image` column to `brand_profiles`
-- This replaces the old hack of appending the image URL to the `description` text field.
ALTER TABLE public.brand_profiles
ADD COLUMN IF NOT EXISTS cover_image TEXT;
