const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
        if (!validDealId && !validUgcOrderId && deal_id) {
          let checkFallback = deal_id;
          if (checkFallback.startsWith("thread_camp_")) checkFallback = checkFallback.replace("thread_camp_", "");
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkFallback);
          if (isUuid) validDealId = checkFallback;
          else validUgcOrderId = checkFallback;
        }
`;

code = code.replace(
  /if \(!validDealId && !validUgcOrderId && deal_id\) \{[\s\S]*?else validUgcOrderId = deal_id;\s*\}/m,
  replacement
);

fs.writeFileSync(file, code);
console.log("Replaced fallback");
