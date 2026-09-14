CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id varchar NOT NULL,
    otp_hash varchar NOT NULL,
    expires_at timestamptz NOT NULL,
    used boolean DEFAULT false NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Add a policy that only admins can access this table directly
CREATE POLICY "Admins have full access to password_reset_tokens"
ON public.password_reset_tokens FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');
