const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /const hasValidSource = \(Boolean\(validDealId\) !== Boolean\(validUgcOrderId\)\);/,
  "const hasValidSource = (Boolean(validDealId) !== Boolean(validUgcOrderId));\n        console.log('Valid Source Check:', { validDealId, validUgcOrderId, hasValidSource, deal_id });"
);

fs.writeFileSync(file, code);
