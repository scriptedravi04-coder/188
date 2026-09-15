const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
        let checkDealId = deal_id;
        if (checkDealId && checkDealId.startsWith("thread_camp_")) {
          checkDealId = checkDealId.replace("thread_camp_", "");
        }
        if (checkDealId) {
          if (checkDealId.startsWith("ugcord_")) {
            const { data: uOrder } = await supabase.from('ugc_orders').select('*').eq('id', checkDealId).maybeSingle();
            if (uOrder) {
              grossAmount = Number(uOrder.creator_payout || uOrder.escrow_amount || uOrder.agreed_amount || uOrder.budget) || 0;
              if (uOrder.creator_id) targetCreatorId = uOrder.creator_id;
              if (uOrder.brand_id) targetBrandId = uOrder.brand_id;
            }
          } else {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkDealId);
            if (isUuid) {
              const { data: dealRec } = await supabase.from('deals').select('*').eq('id', checkDealId).maybeSingle();
              if (dealRec) {
                grossAmount = Number(dealRec.agreed_amount || dealRec.amount_fixed || dealRec.budget || dealRec.gross_amount) || 0;
                if (dealRec.creator_id) targetCreatorId = dealRec.creator_id;
                if (dealRec.brand_id || dealRec.brand_user_id) targetBrandId = dealRec.brand_id || dealRec.brand_user_id;
              }
            }
            if (!grossAmount) {
              const { data: uOrder } = await supabase.from('ugc_orders').select('*').eq('id', checkDealId).maybeSingle();
              if (uOrder) {
                grossAmount = Number(uOrder.creator_payout || uOrder.escrow_amount || uOrder.agreed_amount || uOrder.budget) || 0;
                if (uOrder.creator_id) targetCreatorId = uOrder.creator_id;
                if (uOrder.brand_id) targetBrandId = uOrder.brand_id;
              }
            }
          }
        }
`;

code = code.replace(
  /if \(deal_id\) \{[\s\S]*?if \(thread_id && \(!grossAmount \|\| grossAmount <= 0\)\)/,
  replacement + "\n        if (thread_id && (!grossAmount || grossAmount <= 0))"
);

fs.writeFileSync(file, code);
console.log("Replaced gross");
