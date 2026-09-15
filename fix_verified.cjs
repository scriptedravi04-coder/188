const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /try \{\s*const options = \{\s*amount: Math\.round\(verifiedGrossAmount \* 100\),/m;

const replacement = `
    let verifiedGrossAmount = Number(gross_amount) || 0;
    try {
      const options = {
        amount: Math.round(verifiedGrossAmount * 100),
`;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);
console.log("Fixed verifiedGrossAmount");
