const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /\} catch \(dbErr\) \{ console\.error\('\[persistEscrowPayment\] DB update exception:', dbErr\); console\.log\('__DB_ERR_TRACE__', dbErr\); dealUpdateError = String\(dbErr\); \}/,
  "} catch (dbErr) { console.error('[persistEscrowPayment] DB update exception:', dbErr); dealUpdateError = String(dbErr); }"
);

fs.writeFileSync(file, code);
