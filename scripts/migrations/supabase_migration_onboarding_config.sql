-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed categories
INSERT INTO public.categories (name) VALUES
  ('Fashion & Apparel'),
  ('Beauty & Cosmetics'),
  ('Tech & Gadgets'),
  ('Food & Beverage'),
  ('Travel & Tourism'),
  ('Fitness & Health'),
  ('Gaming & E-Sports'),
  ('Lifestyle'),
  ('Automotive'),
  ('Education'),
  ('Real Estate'),
  ('Finance & Fintech'),
  ('Entertainment'),
  ('Home & Decor'),
  ('Pet Care'),
  ('Childcare & Parenting'),
  ('Software & SaaS'),
  ('Retail'),
  ('Hospitality'),
  ('Sports & Outdoors'),
  ('Jewelry & Accessories')
ON CONFLICT (name) DO NOTHING;

-- Create indian_cities table
CREATE TABLE IF NOT EXISTS public.indian_cities (
  id SERIAL PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT
);

-- Seed indian_cities
INSERT INTO public.indian_cities (city, state) VALUES
  ('Mumbai', 'Maharashtra'),
  ('Delhi', 'Delhi'),
  ('Bangalore', 'Karnataka'),
  ('Hyderabad', 'Telangana'),
  ('Chennai', 'Tamil Nadu'),
  ('Kolkata', 'West Bengal'),
  ('Pune', 'Maharashtra'),
  ('Ahmedabad', 'Gujarat'),
  ('Jaipur', 'Rajasthan'),
  ('Lucknow', 'Uttar Pradesh'),
  ('Noida', 'Uttar Pradesh'),
  ('Gurgaon', 'Haryana'),
  ('Surat', 'Gujarat'),
  ('Kochi', 'Kerala'),
  ('Chandigarh', 'Chandigarh'),
  ('Indore', 'Madhya Pradesh'),
  ('Bhopal', 'Madhya Pradesh'),
  ('Nagpur', 'Maharashtra'),
  ('Patna', 'Bihar'),
  ('Bhubaneswar', 'Odisha'),
  ('Navi Mumbai', 'Maharashtra'),
  ('Thane', 'Maharashtra'),
  ('Faridabad', 'Haryana'),
  ('Ghaziabad', 'Uttar Pradesh');

-- Create platform_config table
CREATE TABLE IF NOT EXISTS public.platform_config (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT,
  icon_path TEXT
);

-- Seed platform_config
INSERT INTO public.platform_config (name, label, icon_path) VALUES
  ('instagram', 'Instagram', '/assets/instagram.svg'),
  ('youtube', 'YouTube', '/assets/youtube.svg'),
  ('twitter', 'X (Twitter)', '/assets/x.svg'),
  ('linkedin', 'LinkedIn', '/assets/linkedin.svg?v=2'),
  ('facebook', 'Facebook', '/assets/facebook.svg'),
  ('threads', 'Threads', '/assets/threads.svg');

-- Create campaign_config table
CREATE TABLE IF NOT EXISTS public.campaign_config (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT
);

-- Seed campaign_config
INSERT INTO public.campaign_config (type, value, label) VALUES
  ('campaign_types', 'paid', 'Paid Collaborations'),
  ('campaign_types', 'barter', 'Barter / Product Send'),
  ('campaign_types', 'ambassador', 'Long-term Ambassador'),
  ('campaign_types', 'onetime', 'One-time Content'),
  ('budget_ranges', 'under_10k', 'Under ₹10,000'),
  ('budget_ranges', '10k_50k', '₹10K–₹50K'),
  ('budget_ranges', '50k_2l', '₹50K–₹2L'),
  ('budget_ranges', '2l_plus', '₹2L+'),
  ('creator_sizes', 'nano', 'Nano 1K–10K'),
  ('creator_sizes', 'micro', 'Micro 10K–100K'),
  ('creator_sizes', 'macro', 'Macro 100K–1M'),
  ('creator_sizes', 'mega', 'Mega 1M+');

-- Add onboarding_complete column to brand_profiles if it exists
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'brand_profiles') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brand_profiles' AND column_name = 'onboarding_complete') THEN
      ALTER TABLE public.brand_profiles ADD COLUMN onboarding_complete BOOLEAN DEFAULT false;
    END IF;
  END IF;
END $$;
