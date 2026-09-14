/**
 * One-time Migration Script: Backfill orphaned pending verifications into creator_kyc and brand_kyc
 * Usage: node scripts/migrate_orphaned_verifications.cjs
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log("Starting backfill migration for orphaned verifications...");
  try {
    const { data: vPending, error: vErr } = await supabase
      .from('verifications')
      .select('*')
      .in('status', ['pending', 'PENDING', 'under_review', 'UNDER_REVIEW']);

    if (vErr) {
      console.error("Failed to query verifications:", vErr.message);
      return;
    }

    if (!vPending || vPending.length === 0) {
      console.log("No pending verifications found to backfill.");
      return;
    }

    const { data: existingCreatorKyc } = await supabase.from('creator_kyc').select('creator_id');
    const { data: existingBrandKyc } = await supabase.from('brand_kyc').select('brand_id');
    
    const creatorIds = new Set((existingCreatorKyc || []).map((c) => c.creator_id));
    const brandIds = new Set((existingBrandKyc || []).map((b) => b.brand_id));

    let migratedCount = 0;

    for (const v of vPending) {
      const isBrand = v.kind === 'brand' || v.type === 'Brand';
      const userId = v.user_id;
      const docs = typeof v.documents === 'object' && v.documents && !Array.isArray(v.documents) ? v.documents : {};

      if (!isBrand && userId && !creatorIds.has(userId)) {
        const { error } = await supabase.from('creator_kyc').upsert({
          creator_id: userId,
          full_name: docs.creator_name || v.name || 'User Submission',
          pan_number: docs.creator_pan || docs.identity_num || 'PENDING',
          pan_card_url: docs.uploaded_files?.[0] || docs.engagement_proof || null,
          aadhaar_front_url: docs.uploaded_files?.[1] || null,
          aadhaar_back_url: docs.uploaded_files?.[2] || null,
          gstin: docs.gstin || null,
          address: docs.creator_state || 'N/A',
          bank_account_no: docs.bank_account || '',
          bank_ifsc: docs.bank_ifsc || '',
          bank_holder_name: docs.creator_name || v.name || '',
          upi_id: docs.upi_id || null,
          instagram_handle: docs.social_handle || v.handle || '',
          follower_count: docs.followers || v.followers || 0,
          status: 'PENDING',
          submitted_at: v.created_at || new Date().toISOString()
        });
        if (!error) migratedCount++;
      } else if (isBrand && userId && !brandIds.has(userId)) {
        const { error } = await supabase.from('brand_kyc').upsert({
          brand_id: userId,
          company_name: docs.company_name || v.name || 'Brand Submission',
          gstin: docs.gst_cert || docs.gstin || null,
          pan_number: docs.brand_pan || docs.pan_number || 'PENDING',
          incorporation_type: docs.incorporation_type || 'pvt_ltd',
          poc_name: docs.poc_name || v.name || '',
          poc_designation: docs.poc_designation || 'Representative',
          poc_email: docs.poc_email || v.email || '',
          poc_phone: docs.poc_phone || '',
          website_url: docs.website || '',
          gst_certificate_url: docs.uploaded_files?.[0] || null,
          incorporation_doc_url: docs.uploaded_files?.[1] || docs.incorporation_proof || null,
          status: 'PENDING',
          submitted_at: v.created_at || new Date().toISOString()
        });
        if (!error) migratedCount++;
      }
    }
    console.log(`Migration complete. Backfilled ${migratedCount} rows.`);
  } catch (err) {
    console.error("Migration error:", err);
  }
}

runMigration();
