const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /console.log\('Valid Source Check:', \{ validDealId, validUgcOrderId, hasValidSource, deal_id \}\);/,
  "const fs = require('fs'); fs.appendFileSync('debug.log', JSON.stringify({ validDealId, validUgcOrderId, hasValidSource, deal_id }) + '\\n');"
);

fs.writeFileSync(file, code);
