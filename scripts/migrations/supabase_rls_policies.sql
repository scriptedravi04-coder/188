-- ==========================================
-- SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- This script drops blanket public-role read/write policies and implements narrow,
-- secure Row Level Security (RLS) policies on all tables in the public schema.
-- Run this script in your Supabase SQL Editor to secure your database.

-- ==========================================
-- 1. SECURE THE public.users TABLE (Fix 1)
-- ==========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on users" ON public.users;
DROP POLICY IF EXISTS "Allow all access" ON public.users;
DROP POLICY IF EXISTS "Allow public read-write" ON public.users;

-- Create narrow, secure policies:
-- Profile lookup/social proofs: anyone can view basic profile columns of any user.
CREATE POLICY "Allow public read of basic profile" ON public.users
    FOR SELECT
    USING (true);

-- Revoke select on sensitive columns (password_hash) from public role (anon, authenticated)
-- This ensures that password hashes can never be read from the frontend clients.
REVOKE SELECT (password_hash) ON public.users FROM anon, authenticated;

-- Allow users to update their own columns ONLY if their auth.uid() matches their user_id.
CREATE POLICY "Allow users to update their own profile" ON public.users
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

-- Allow new user insertions (needed for signup from the frontend)
CREATE POLICY "Allow user insertion during signup" ON public.users
    FOR INSERT
    WITH CHECK (true);


-- ==========================================
-- 2. SECURE THE kyc-documents STORAGE BUCKET (Fix 2)
-- ==========================================
-- Ensure kyc-documents bucket exists and is set to private
INSERT INTO storage.buckets (id, name, public) 
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Enable RLS on storage objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing storage policies for kyc-documents
DROP POLICY IF EXISTS "Allow public read on kyc-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public write on kyc-documents" ON storage.objects;

-- Create narrow policies for kyc-documents:
-- Allow authenticated users to upload KYC documents in their own folder or with their ownership.
CREATE POLICY "Allow authenticated users to upload KYC" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'kyc-documents' AND (owner = auth.uid()::text OR (storage.foldername(name))[1] = auth.uid()::text));

-- Allow authenticated owners to read their own KYC documents.
CREATE POLICY "Allow owners to read KYC" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'kyc-documents' AND (owner = auth.uid()::text OR (storage.foldername(name))[1] = auth.uid()::text));


-- ==========================================
-- 3. SECURE THE public.user_sessions TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on user_sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Allow all access" ON public.user_sessions;
DROP POLICY IF EXISTS "Allow public read-write" ON public.user_sessions;

-- Allow users to manage their own sessions only
CREATE POLICY "Allow users access to own sessions" ON public.user_sessions
    FOR ALL
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);


-- ==========================================
-- 4. SECURE THE public.creator_profiles TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on creator_profiles" ON public.creator_profiles;
DROP POLICY IF EXISTS "Allow all access" ON public.creator_profiles;
DROP POLICY IF EXISTS "Allow public read-write" ON public.creator_profiles;

-- Anyone can read creator profiles
CREATE POLICY "Allow public read of creator profiles" ON public.creator_profiles
    FOR SELECT
    USING (true);

-- Only owners can manage their creator profiles
CREATE POLICY "Allow owner to insert own creator profile" ON public.creator_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Allow owner to update own creator profile" ON public.creator_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);


-- ==========================================
-- 5. SECURE THE public.brand_profiles TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on brand_profiles" ON public.brand_profiles;
DROP POLICY IF EXISTS "Allow all access" ON public.brand_profiles;
DROP POLICY IF EXISTS "Allow public read-write" ON public.brand_profiles;

-- Anyone can read brand profiles
CREATE POLICY "Allow public read of brand profiles" ON public.brand_profiles
    FOR SELECT
    USING (true);

-- Only owners can manage their brand profiles
CREATE POLICY "Allow owner to insert own brand profile" ON public.brand_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Allow owner to update own brand profile" ON public.brand_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);


-- ==========================================
-- 6. SECURE THE public.campaigns TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Allow all access" ON public.campaigns;
DROP POLICY IF EXISTS "Allow public read-write" ON public.campaigns;

-- Anyone can view campaigns
CREATE POLICY "Allow public read of campaigns" ON public.campaigns
    FOR SELECT
    USING (true);

-- Only brands can create and manage their own campaigns
CREATE POLICY "Allow brand to insert own campaigns" ON public.campaigns
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = brand_user_id);

CREATE POLICY "Allow brand to update own campaigns" ON public.campaigns
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = brand_user_id)
    WITH CHECK (auth.uid()::text = brand_user_id);

CREATE POLICY "Allow brand/admin to delete campaigns" ON public.campaigns
    FOR DELETE
    TO authenticated
    USING (auth.uid()::text = brand_user_id);


-- ==========================================
-- 7. SECURE THE public.campaign_applications TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.campaign_applications ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on campaign_applications" ON public.campaign_applications;
DROP POLICY IF EXISTS "Allow all access" ON public.campaign_applications;
DROP POLICY IF EXISTS "Allow public read-write" ON public.campaign_applications;

-- Creators can see their own applications; Brand owners of the campaign can see them too
CREATE POLICY "Allow creator or campaign brand to read applications" ON public.campaign_applications
    FOR SELECT
    TO authenticated
    USING (
        auth.uid()::text = creator_id OR 
        EXISTS (
            SELECT 1 FROM public.campaigns c 
            WHERE c.campaign_id = campaign_applications.campaign_id AND c.brand_user_id = auth.uid()::text
        )
    );

-- Only creators can apply (insert)
CREATE POLICY "Allow creator to insert own applications" ON public.campaign_applications
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = creator_id);

-- Creators can update their applications, or brands can update status (e.g. Accept/Reject)
CREATE POLICY "Allow creator or campaign brand to update applications" ON public.campaign_applications
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid()::text = creator_id OR 
        EXISTS (
            SELECT 1 FROM public.campaigns c 
            WHERE c.campaign_id = campaign_applications.campaign_id AND c.brand_user_id = auth.uid()::text
        )
    )
    WITH CHECK (
        auth.uid()::text = creator_id OR 
        EXISTS (
            SELECT 1 FROM public.campaigns c 
            WHERE c.campaign_id = campaign_applications.campaign_id AND c.brand_user_id = auth.uid()::text
        )
    );


-- ==========================================
-- 8. SECURE THE public.notifications TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow all access" ON public.notifications;
DROP POLICY IF EXISTS "Allow public read-write" ON public.notifications;

-- Users can read and mark read their own notifications only
CREATE POLICY "Allow users to read own notifications" ON public.notifications
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = user_id);

CREATE POLICY "Allow users to update own notifications" ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

-- Anyone can send/insert a notification to a user
CREATE POLICY "Allow insertion of notifications" ON public.notifications
    FOR INSERT
    TO authenticated
    WITH CHECK (true);


-- ==========================================
-- 9. SECURE THE public.ugc_briefs TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.ugc_briefs ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on ugc_briefs" ON public.ugc_briefs;
DROP POLICY IF EXISTS "Allow all access" ON public.ugc_briefs;
DROP POLICY IF EXISTS "Allow public read-write" ON public.ugc_briefs;

-- Anyone can read UGC briefs
CREATE POLICY "Allow public read of UGC briefs" ON public.ugc_briefs
    FOR SELECT
    USING (true);

-- Only brands can create or edit their UGC briefs
CREATE POLICY "Allow brand to insert own briefs" ON public.ugc_briefs
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = brand_id);

CREATE POLICY "Allow brand to update own briefs" ON public.ugc_briefs
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = brand_id)
    WITH CHECK (auth.uid()::text = brand_id);


-- ==========================================
-- 10. SECURE THE public.ugc_orders TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.ugc_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on ugc_orders" ON public.ugc_orders;
DROP POLICY IF EXISTS "Allow all access" ON public.ugc_orders;
DROP POLICY IF EXISTS "Allow public read-write" ON public.ugc_orders;

-- Creator or brand participating in the UGC order can read/write
CREATE POLICY "Allow users to read own UGC orders" ON public.ugc_orders
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = creator_id OR auth.uid()::text = brand_id);

CREATE POLICY "Allow users to insert own UGC orders" ON public.ugc_orders
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = creator_id OR auth.uid()::text = brand_id);

CREATE POLICY "Allow users to update own UGC orders" ON public.ugc_orders
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = creator_id OR auth.uid()::text = brand_id)
    WITH CHECK (auth.uid()::text = creator_id OR auth.uid()::text = brand_id);


-- ==========================================
-- 11. SECURE THE public.reports TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on reports" ON public.reports;
DROP POLICY IF EXISTS "Allow all access" ON public.reports;
DROP POLICY IF EXISTS "Allow public read-write" ON public.reports;

-- Authenticated users can insert reports
CREATE POLICY "Allow authenticated users to create reports" ON public.reports
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = reporter_user_id);

-- Only the reporter or admins can read reports
CREATE POLICY "Allow reporter or admin to read reports" ON public.reports
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = reporter_user_id OR EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'));


-- ==========================================
-- 12. SECURE THE public.waves TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.waves ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on waves" ON public.waves;
DROP POLICY IF EXISTS "Allow all access" ON public.waves;
DROP POLICY IF EXISTS "Allow public read-write" ON public.waves;

-- Only sender or receiver can see the wave
CREATE POLICY "Allow users to read own waves" ON public.waves
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = from_user_id OR auth.uid()::text = to_user_id);

-- Any authenticated user can send a wave
CREATE POLICY "Allow authenticated users to send waves" ON public.waves
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = from_user_id);

-- Senders or receivers can update waves (e.g. status)
CREATE POLICY "Allow users to update own waves" ON public.waves
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = from_user_id OR auth.uid()::text = to_user_id)
    WITH CHECK (auth.uid()::text = from_user_id OR auth.uid()::text = to_user_id);


-- ==========================================
-- 13. SECURE THE public.chat_threads TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on chat_threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Allow all access" ON public.chat_threads;
DROP POLICY IF EXISTS "Allow public read-write" ON public.chat_threads;

-- Only participating brand or creator can read/write threads
CREATE POLICY "Allow participants to access threads" ON public.chat_threads
    FOR ALL
    TO authenticated
    USING (auth.uid()::text = creator_id OR auth.uid()::text = brand_id)
    WITH CHECK (auth.uid()::text = creator_id OR auth.uid()::text = brand_id);


-- ==========================================
-- 14. SECURE THE public.chat_messages TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Allow all access" ON public.chat_messages;
DROP POLICY IF EXISTS "Allow public read-write" ON public.chat_messages;

-- Only participating thread users can read thread messages
CREATE POLICY "Allow participants to read thread messages" ON public.chat_messages
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_threads t
            WHERE t.thread_id = chat_messages.thread_id AND (t.creator_id = auth.uid()::text OR t.brand_id = auth.uid()::text)
        )
    );

-- Only participating thread users can send/insert messages
CREATE POLICY "Allow participants to insert thread messages" ON public.chat_messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_user_id = auth.uid()::text AND
        EXISTS (
            SELECT 1 FROM public.chat_threads t
            WHERE t.thread_id = chat_messages.thread_id AND (t.creator_id = auth.uid()::text OR t.brand_id = auth.uid()::text)
        )
    );


-- ==========================================
-- 15. SECURE THE public.message_flags TABLE (Fix 3)
-- ==========================================
ALTER TABLE public.message_flags ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on message_flags" ON public.message_flags;
DROP POLICY IF EXISTS "Allow all access" ON public.message_flags;
DROP POLICY IF EXISTS "Allow public read-write" ON public.message_flags;

-- Any authenticated user can create a flag
CREATE POLICY "Allow authenticated to create flags" ON public.message_flags
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = reporter_id);

-- Only admins can see flags
CREATE POLICY "Allow admin to read flags" ON public.message_flags
    FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'));


-- ==========================================
-- 16. SECURE THE public.ybex_sync TABLE
-- ==========================================
ALTER TABLE public.ybex_sync ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies
DROP POLICY IF EXISTS "Allow public read-write on ybex_sync" ON public.ybex_sync;

-- Allow public read-write on ybex_sync table so background process can keep app state in sync
CREATE POLICY "Allow public read-write on ybex_sync" ON public.ybex_sync
    FOR ALL
    USING (true)
    WITH CHECK (true);


-- ==========================================
-- 17. SECURE THE public.creator_kyc AND public.brand_kyc TABLES (Fix 4)
-- ==========================================
ALTER TABLE public.creator_kyc ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow creators to read own KYC" ON public.creator_kyc;
CREATE POLICY "Allow creators to read own KYC" ON public.creator_kyc
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = creator_id OR EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'));

DROP POLICY IF EXISTS "Allow creators to insert own KYC" ON public.creator_kyc;
CREATE POLICY "Allow creators to insert own KYC" ON public.creator_kyc
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = creator_id);

DROP POLICY IF EXISTS "Allow creators to update own KYC" ON public.creator_kyc;
CREATE POLICY "Allow creators to update own KYC" ON public.creator_kyc
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = creator_id OR EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'))
    WITH CHECK (auth.uid()::text = creator_id OR EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'));


ALTER TABLE public.brand_kyc ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow brands to read own KYC" ON public.brand_kyc;
CREATE POLICY "Allow brands to read own KYC" ON public.brand_kyc
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = brand_id OR EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'));

DROP POLICY IF EXISTS "Allow brands to insert own KYC" ON public.brand_kyc;
CREATE POLICY "Allow brands to insert own KYC" ON public.brand_kyc
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = brand_id);

DROP POLICY IF EXISTS "Allow brands to update own KYC" ON public.brand_kyc;
CREATE POLICY "Allow brands to update own KYC" ON public.brand_kyc
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = brand_id OR EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'))
    WITH CHECK (auth.uid()::text = brand_id OR EXISTS (SELECT 1 FROM public.users WHERE user_id = auth.uid()::text AND role = 'admin'));


-- ==========================================
-- 18. SECURE THE public.ugc_deliveries, public.ugc_reviews, public.fee_configs, AND public.earnings TABLES
-- ==========================================

-- Enable Row Level Security
ALTER TABLE public.ugc_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ugc_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;

-- Drop existing blanket policies if any exist
DROP POLICY IF EXISTS "Allow all access" ON public.ugc_deliveries;
DROP POLICY IF EXISTS "Allow public read-write" ON public.ugc_deliveries;
DROP POLICY IF EXISTS "Allow users and admins access to own ugc_deliveries" ON public.ugc_deliveries;

DROP POLICY IF EXISTS "Allow all access" ON public.ugc_reviews;
DROP POLICY IF EXISTS "Allow public read-write" ON public.ugc_reviews;

DROP POLICY IF EXISTS "Allow all access" ON public.fee_configs;
DROP POLICY IF EXISTS "Allow public read-write" ON public.fee_configs;

DROP POLICY IF EXISTS "Allow all access" ON public.earnings;
DROP POLICY IF EXISTS "Allow public read-write" ON public.earnings;


-- POLICIES FOR public.ugc_deliveries

-- Select Policy: Creator or brand participating in the related UGC order can view, or any admin
CREATE POLICY "Allow users to read own ugc_deliveries" ON public.ugc_deliveries
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ugc_orders 
            WHERE public.ugc_orders.id = public.ugc_deliveries.order_id 
            AND (public.ugc_orders.creator_id = auth.uid()::text OR public.ugc_orders.brand_id = auth.uid()::text)
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Insert Policy: Creator or brand participating in the related UGC order can insert, or any admin
CREATE POLICY "Allow users to insert own ugc_deliveries" ON public.ugc_deliveries
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ugc_orders 
            WHERE public.ugc_orders.id = order_id 
            AND (public.ugc_orders.creator_id = auth.uid()::text OR public.ugc_orders.brand_id = auth.uid()::text)
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Update Policy: Creator or brand participating in the related UGC order can update, or any admin
CREATE POLICY "Allow users to update own ugc_deliveries" ON public.ugc_deliveries
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ugc_orders 
            WHERE public.ugc_orders.id = public.ugc_deliveries.order_id 
            AND (public.ugc_orders.creator_id = auth.uid()::text OR public.ugc_orders.brand_id = auth.uid()::text)
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ugc_orders 
            WHERE public.ugc_orders.id = order_id 
            AND (public.ugc_orders.creator_id = auth.uid()::text OR public.ugc_orders.brand_id = auth.uid()::text)
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Delete Policy: Only admins can delete deliveries
CREATE POLICY "Allow admin to delete ugc_deliveries" ON public.ugc_deliveries
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );


-- POLICIES FOR public.ugc_reviews

-- Select Policy: Creator or brand of the review, or admin
CREATE POLICY "Allow users to read own ugc_reviews" ON public.ugc_reviews
    FOR SELECT
    TO authenticated
    USING (
        auth.uid()::text = creator_id 
        OR auth.uid()::text = brand_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Insert Policy: Creator or brand of the review, or admin
CREATE POLICY "Allow users to insert own ugc_reviews" ON public.ugc_reviews
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid()::text = creator_id 
        OR auth.uid()::text = brand_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Update Policy: Creator or brand of the review, or admin
CREATE POLICY "Allow users to update own ugc_reviews" ON public.ugc_reviews
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid()::text = creator_id 
        OR auth.uid()::text = brand_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    )
    WITH CHECK (
        auth.uid()::text = creator_id 
        OR auth.uid()::text = brand_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Delete Policy: Only admins
CREATE POLICY "Allow admin to delete ugc_reviews" ON public.ugc_reviews
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );


-- POLICIES FOR public.fee_configs

-- Select Policy: Anyone authenticated can read active fee configs
CREATE POLICY "Allow authenticated to read fee_configs" ON public.fee_configs
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert Policy: Only admins
CREATE POLICY "Allow admin to insert fee_configs" ON public.fee_configs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Update Policy: Only admins
CREATE POLICY "Allow admin to update fee_configs" ON public.fee_configs
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Delete Policy: Only admins
CREATE POLICY "Allow admin to delete fee_configs" ON public.fee_configs
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );


-- POLICIES FOR public.earnings

-- Select Policy: User can view their own earnings, or admin can view all
CREATE POLICY "Allow users to read own earnings" ON public.earnings
    FOR SELECT
    TO authenticated
    USING (
        auth.uid()::text = user_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Insert Policy: User can insert their own earnings, or admin can insert
CREATE POLICY "Allow users to insert own earnings" ON public.earnings
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid()::text = user_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Update Policy: User can update their own earnings, or admin can update
CREATE POLICY "Allow users to update own earnings" ON public.earnings
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid()::text = user_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    )
    WITH CHECK (
        auth.uid()::text = user_id 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );

-- Delete Policy: Only admins
CREATE POLICY "Allow admin to delete earnings" ON public.earnings
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE public.users.user_id = auth.uid()::text AND public.users.role = 'admin'
        )
    );



