const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const hugeString = 'data:image/png;base64,' + 'A'.repeat(500000);
    const id = crypto.randomUUID();
    const res = await supabase.from('banners').insert({
        id: id,
        image_url: hugeString,
        target_dashboard: 'brand',
        active: true,
        created_at: new Date().toISOString()
    }).select();
    console.log(res.error ? "Error: " + res.error.message : "Success inserted ID: " + res.data[0].id);
    
    if(!res.error) {
        await supabase.from('banners').delete().eq('id', id);
    }
}
run();
