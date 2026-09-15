const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('ybex_sync').select('*').eq('id', 1).single();
  if (data && data.state && data.state.banners) {
    console.log("Banners in sync:", data.state.banners);
  } else {
    console.log("No banners in sync");
  }
}
run();
