console.log("URL:", process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
console.log("Service Key defined:", !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY));
console.log("Anon Key defined:", !!(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY));
