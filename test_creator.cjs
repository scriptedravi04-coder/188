require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);
async function test(val) {
  const { data, error } = await supabase.from('banners').insert({
      id: require('crypto').randomUUID(),
      target_dashboard: val,
      image_url: 'http',
      active: true,
      created_at: new Date().toISOString()
  }).select();
  console.log(`Val ${val}:`, error?.message || 'Success');
}
async function run() {
  await test('creator');
  await test('creators');
}
run();
