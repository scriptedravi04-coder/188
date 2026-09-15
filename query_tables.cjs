const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    try {
        // Query pg_tables through a REST endpoint if it exists, or just try fetching known tables
        const tables = ['banners', 'hero_banners', 'admin_banners', 'ybex_banners'];
        for (const t of tables) {
            const { data, error } = await supabase.from(t).select('count', { count: 'exact' });
            console.log(`Table ${t}:`, data, error?.message || 'Success');
        }
    } catch(e) { console.error(e); }
}
run();
