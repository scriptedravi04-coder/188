CREATE TABLE IF NOT EXISTS landing_brands (
  id text PRIMARY KEY,
  name text NOT NULL,
  logo_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landing_reviews (
  id text PRIMARY KEY,
  author_name text NOT NULL,
  author_role text,
  author_image text,
  content text NOT NULL,
  category text,
  highlight_text text,
  highlight_color text,
  type text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
