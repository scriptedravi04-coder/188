-- ==========================================
-- SUPABASE ROW LEVEL SECURITY (RLS) MIGRATION
-- TARGET TABLES: ugc_deliveries, ugc_reviews, fee_configs, earnings
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


-- ==========================================
-- 1. POLICIES FOR public.ugc_deliveries
-- ==========================================

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


-- ==========================================
-- 2. POLICIES FOR public.ugc_reviews
-- ==========================================

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


-- ==========================================
-- 3. POLICIES FOR public.fee_configs
-- ==========================================

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


-- ==========================================
-- 4. POLICIES FOR public.earnings
-- ==========================================

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
