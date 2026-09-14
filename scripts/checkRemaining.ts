import { createClient } from "@supabase/supabase-js";
let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://mzcovvzkwzjvzskjqwwy.supabase.co';
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Vbd74GKG1eYP7NYp4qtFbg_kuQuDPKv';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data: users, error } = await supabase.from('users').select('user_id, email, name');
  if (error) return console.error(error);
  const remainingTest = users.filter(u => {
    const email = (u.email || '').toLowerCase();
    const name = (u.name || '').toLowerCase();
    return name.includes('test') || name.includes('old user') || email.includes('test') || email.includes('null_pass');
  });
  console.log(remainingTest.map(u => u.email + " : " + u.name));
}
run();
