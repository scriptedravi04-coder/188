const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /if \(insErr\) \{ console\.error\('\[persistEscrowPayment\] Supabase transaction insert error:', insErr\); require\('fs'\)\.appendFileSync\('inserr\.log', JSON\.stringify\(insErr\) \+ '\\n'\); dealUpdateError = String\(insErr\); \}/,
  "if (insErr) { console.error('[persistEscrowPayment] Supabase transaction insert error:', insErr); dealUpdateError = JSON.stringify(insErr); }"
);

fs.writeFileSync(file, code);
