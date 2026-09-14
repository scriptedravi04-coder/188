-- Migration: Add message_type and metadata columns to chat_messages
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/mzcovvzkwzjvzskjqwwy/sql

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS message_type text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Create index on message_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_chat_messages_message_type ON public.chat_messages (message_type);

-- Create index on thread_id and created_at if not already present
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON public.chat_messages (thread_id, created_at);
