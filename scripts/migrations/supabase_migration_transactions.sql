-- ============================================================================
-- SUPABASE MIGRATION SCRIPT
-- Copy and paste this script directly into your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/mzcovvzkwzjvzskjqwwy/sql/new
-- ============================================================================

-- STEP 1: Rename legacy zaakpay_order_id column to generic payment_order_id if it exists
DO $$ 
BEGIN 
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'zaakpay_order_id'
  ) THEN
    ALTER TABLE transactions RENAME COLUMN zaakpay_order_id TO payment_order_id;
  END IF;
END $$;

-- STEP 2: Ensure all required columns exist on the transactions table
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id UUID,
  ADD COLUMN IF NOT EXISTS brief_id UUID,
  ADD COLUMN IF NOT EXISTS brand_id UUID,
  ADD COLUMN IF NOT EXISTS escrow_hold BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS payment_order_id TEXT;

-- STEP 3: Create the RPC function for atomic status sync between deals and transactions
CREATE OR REPLACE FUNCTION sync_deal_and_transaction_status(
  p_deal_id TEXT,
  p_deal_status TEXT,
  p_txn_status TEXT,
  p_escrow_hold BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 3a. Update deals table
  UPDATE deals
  SET 
    status = p_deal_status,
    escrow_hold = p_escrow_hold,
    updated_at = NOW()
  WHERE id::text = p_deal_id;

  -- 3b. Update transactions table in the same atomic transaction block
  UPDATE transactions
  SET 
    status = p_txn_status,
    escrow_hold = p_escrow_hold
  WHERE deal_id::text = p_deal_id OR id::text = p_deal_id;
END;
$$;
