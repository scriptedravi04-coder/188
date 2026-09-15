const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    try {
        const res2 = await supabase.from('banners').insert({ image_url: 'http', target_dashboard: 'brand' }).select();
        console.log("Result:", res2.error || res2.data);
    } catch(e) {
        console.error(e);
    }
}
run();
