import { createClient } from "@supabase/supabase-js";
let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mzcovvzkwzjvzskjqwwy.supabase.co';
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Vbd74GKG1eYP7NYp4qtFbg_kuQuDPKv';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data: users, error } = await supabase.from('users').select('user_id, email, name');
  if (error) return console.error(error);
  const testUsers = users.filter(u => {
    const email = (u.email || '').toLowerCase();
    const name = (u.name || '').toLowerCase();
    return name.includes('test') || name.includes('old user') || email.includes('test') || email.includes('null_pass');
  });
  console.log(`Found ${testUsers.length} test users to delete.`);
  const userIds = testUsers.map(u => u.user_id);
  if (userIds.length === 0) return;

  const tablesWithUserId = ['creator_profiles', 'brand_profiles', 'creator_kyc', 'brand_kyc', 'user_sessions', 'notifications'];
  for (const uid of userIds) {
    console.log(`Deleting data for user ${uid}...`);
    await supabase.from('invoices').delete().eq('creator_id', uid);
    await supabase.from('invoices').delete().eq('brand_id', uid);
    await supabase.from('chat_threads').delete().eq('creator_id', uid);
    await supabase.from('chat_threads').delete().eq('brand_user_id', uid);
    await supabase.from('deals').delete().eq('creator_id', uid);
    await supabase.from('deals').delete().eq('brand_id', uid);
    await supabase.from('campaign_applications').delete().eq('creator_id', uid);
    await supabase.from('collabs').delete().eq('creator_id', uid);
    await supabase.from('collabs').delete().eq('brand_id', uid);
    await supabase.from('campaigns').delete().eq('brand_user_id', uid);
    
    for (const t of tablesWithUserId) {
      await supabase.from(t).delete().eq('user_id', uid);
    }
    await supabase.from('notifications').delete().eq('user_id', uid);
    await supabase.from('users').delete().eq('user_id', uid);
  }
  console.log("Done.");
}
run();
