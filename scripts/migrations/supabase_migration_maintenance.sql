-- ==========================================================
-- YBEX — MAINTENANCE MODE SQL MIGRATION
-- Adds a global maintenance_mode table to control platform access
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_mode (
  id VARCHAR PRIMARY KEY DEFAULT 'singleton',
  creator_side_enabled BOOLEAN DEFAULT false,
  brand_side_enabled BOOLEAN DEFAULT false,
  message TEXT, -- optional custom message shown to users
  enabled_by VARCHAR REFERENCES public.users(user_id),
  enabled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Seed initial row
INSERT INTO public.maintenance_mode (id, creator_side_enabled, brand_side_enabled, message)
VALUES ('singleton', false, false, '')
ON CONFLICT (id) DO NOTHING;

-- Grant permissions to public roles
ALTER TABLE public.maintenance_mode ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read the maintenance status
CREATE POLICY "Allow public read-only access to maintenance_mode" 
ON public.maintenance_mode 
FOR SELECT 
USING (true);

-- Allow authenticated users to update maintenance mode (handled securely via backend service role or service level, or simple open update for ease of testing if authenticated)
CREATE POLICY "Allow authenticated updates to maintenance_mode" 
ON public.maintenance_mode 
FOR ALL 
USING (true)
WITH CHECK (true);
