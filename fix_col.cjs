const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /razorpay_payment_id: razorpay_payment_id \|\| null,/,
  ""
);

fs.writeFileSync(file, code);
