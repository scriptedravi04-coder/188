const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.storage.listBuckets();
  console.log("Buckets:", data?.map(b => b.name));
  
  if (data) {
     for (const b of data) {
        const { data: files } = await supabase.storage.from(b.name).list();
        console.log(`Bucket ${b.name} files:`, files?.map(f => f.name));
     }
  }
}
run();
