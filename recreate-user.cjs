const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Let's see if we can find the deleted user
  const { data: existingUser } = await supabase.from('users').select('*').ilike('email', '%commonuseforpro%').single();
  console.log("Existing user found:", existingUser?.email);

  if (existingUser && existingUser.email.startsWith("deleted_")) {
    console.log("Restoring the deleted user!");
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("123456", salt); // default password if none is set
    
    // We update it back to commonuseforpro@gmail.com and remove the deleted flag
    const { error: updateError } = await supabase.from('users').update({
      email: 'commonuseforpro@gmail.com',
      is_deleted: false,
      deleted_at: null,
      status: 'active'
    }).eq('user_id', existingUser.user_id);
    
    if (updateError) console.error("Error updating user:", updateError);
    else console.log("User restored to commonuseforpro@gmail.com");
  } else if (!existingUser) {
    console.log("Creating brand new user!");
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("password", salt); // what password do they use?
    
    const { error: insertError } = await supabase.from('users').insert([{
      user_id: require('crypto').randomUUID(),
      email: 'commonuseforpro@gmail.com',
      name: 'Common Use',
      role: 'admin',
      password_hash: hash,
      is_deleted: false
    }]);
    
    if (insertError) console.error("Error inserting user:", insertError);
    else console.log("User created!");
  } else {
    console.log("User already exists as:", existingUser.email);
    // Maybe just reset password if needed
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("123456", salt);
    await supabase.from('users').update({ password_hash: hash }).eq('user_id', existingUser.user_id);
  }
}
main();
