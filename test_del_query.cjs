require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('banners').delete().eq('id', 'b2400e60-f91d-469e-a0f2-3afd599471b8').select();
  console.log("Error:", error?.message || 'Success');
  console.log("Data deleted:", data);
}
run();
