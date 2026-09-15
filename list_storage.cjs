const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.storage.from('banner-images').list();
  console.log("Storage banner-images:", data);
  const { data: d2 } = await supabase.storage.from('banners').list();
  console.log("Storage banners:", d2);
  const { data: d3 } = await supabase.storage.from('public').list();
  console.log("Storage public:", d3?.filter(f => f.name.includes('banner')));
}
run();
