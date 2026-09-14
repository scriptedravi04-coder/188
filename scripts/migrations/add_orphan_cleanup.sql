ALTER TABLE public.ugc_orders ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS public.file_cleanup_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT,
    record_id TEXT,
    file_path TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
