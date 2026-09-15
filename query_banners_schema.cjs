const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    try {
        const { data, error } = await supabase.from('banners').select('*').limit(1);
        console.log("Data:", data, "Error:", error);
    } catch(e) { console.error(e); }
}
run();
