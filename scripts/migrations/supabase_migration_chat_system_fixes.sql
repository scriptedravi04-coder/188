-- ========================================================================
-- CHAT SYSTEM MIGRATION FIXES
-- Project: ybex-app (mzcovvzkwzjvzskjqwwy)
-- Target Database: Supabase / PostgreSQL
-- ========================================================================

BEGIN;

-- ------------------------------------------------------------------------
-- ISSUE 3: user_violations.thread_id is type uuid, but thread IDs are text
-- ------------------------------------------------------------------------
-- Change the thread_id column type in user_violations to TEXT so it can 
-- store actual thread ID values like 'thread_1783771652818_bcgjdx'.
-- ------------------------------------------------------------------------
ALTER TABLE public.user_violations ALTER COLUMN thread_id TYPE text;

-- ------------------------------------------------------------------------
-- ISSUE 2: chat_messages.thread_id has no foreign key, allowing orphans
-- ------------------------------------------------------------------------
-- 1. Identify any existing orphaned rows for review/cleanup.
--    You can run this query first to see what rows are affected:
--    SELECT message_id, thread_id FROM public.chat_messages WHERE thread_id NOT IN (SELECT id FROM public.chat_threads);
--
-- 2. Drop the existing constraint if it exists to avoid conflicts.
-- ------------------------------------------------------------------------
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS fk_chat_messages_thread;

-- 3. Add the foreign key constraint from chat_messages(thread_id) to chat_threads(id)
--    NOTE: If there are existing orphaned messages in chat_messages, you must either
--    delete them first, or add the foreign key with "NOT VALID" and then validate it.
--    To clean up orphans first, run:
--    DELETE FROM public.chat_messages WHERE thread_id NOT IN (SELECT id FROM public.chat_threads);
-- ------------------------------------------------------------------------
ALTER TABLE public.chat_messages 
ADD CONSTRAINT fk_chat_messages_thread 
FOREIGN KEY (thread_id) 
REFERENCES public.chat_threads(id) 
ON DELETE CASCADE;

COMMIT;
