const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
        const candidateId = deal_id || thread_id;
        if (candidateId) {
          if (candidateId.startsWith("ugcord_")) {
            validUgcOrderId = candidateId;
          } else if (candidateId.startsWith("thread_camp_")) {
            const extracted = candidateId.replace("thread_camp_", "");
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(extracted);
            if (isUuid) {
              validDealId = extracted;
            }
          } else {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
            if (isUuid) {
              const { data: dCheck } = await supabase.from('deals').select('id').eq('id', candidateId).maybeSingle();
              if (dCheck) validDealId = candidateId;
            }
            if (!validDealId) {
              const { data: uCheck } = await supabase.from('ugc_orders').select('id').eq('id', candidateId).maybeSingle();
              if (uCheck) validUgcOrderId = candidateId;
            }
          }
        }
`;

code = code.replace(
  /const candidateId = deal_id \|\| thread_id;[\s\S]*?if \(!validDealId && !validUgcOrderId && deal_id\) \{/m,
  replacement + "\n        if (!validDealId && !validUgcOrderId && deal_id) {"
);

fs.writeFileSync(file, code);
console.log("Replaced");
