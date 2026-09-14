-- Migration: Add thread_id and page_context columns to support_tickets table
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS thread_id TEXT NULL,
ADD COLUMN IF NOT EXISTS page_context TEXT NULL;
