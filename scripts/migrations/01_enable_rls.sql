-- Enable RLS on the specified tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indian_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_config ENABLE ROW LEVEL SECURITY;

-- Create policies for SELECT (public read access)
CREATE POLICY "Allow public read access on categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Allow public read access on indian_cities" ON public.indian_cities FOR SELECT USING (true);
CREATE POLICY "Allow public read access on platform_config" ON public.platform_config FOR SELECT USING (true);
CREATE POLICY "Allow public read access on campaign_config" ON public.campaign_config FOR SELECT USING (true);
