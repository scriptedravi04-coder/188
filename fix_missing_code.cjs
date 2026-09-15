const fs = require('fs');
const file = 'backend/payment_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /\/\/ Verify \/ recompute amount server-side against actual database records[\s\S]*?if \(!grossAmount \|\| grossAmount <= 0\) \{/m;

const replacement = `
    try {
      const options = {
        amount: Math.round(verifiedGrossAmount * 100),
        currency: "INR",
        receipt: \`rcpt_\${Date.now()}\`
      };
      
      const order = await rzp.orders.create(options);
      
      return res.json({
        success: true,
        key_id: process.env.RAZORPAY_KEY_ID,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        user_name: user.name || "Brand User",
        user_email: user.email || "",
        user_phone: user.phone || ""
      });
    } catch (err: any) {
      console.error("[Razorpay Create Order] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to create Razorpay order." });
    }
  });

  async function persistEscrowPayment({
    razorpay_order_id,
    razorpay_payment_id,
    deal_id,
    thread_id,
    user,
    req,
  }: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    deal_id?: string | null;
    thread_id?: string | null;
    user?: any;
    req: express.Request;
  }): Promise<{ safeGross: number; dealUpdateError: string | null; threadUpdateError: string | null; alreadyProcessed: boolean }> {
    let dealUpdateError: string | null = null;
    let threadUpdateError: string | null = null;

    if (supabase && razorpay_order_id) {
      try {
        const { data: existingTxn } = await supabase
          .from('transactions')
          .select('gross_amount')
          .eq('zaakpay_order_id', razorpay_order_id)
          .maybeSingle();
        if (existingTxn) {
          return { safeGross: Number(existingTxn.gross_amount) || 0, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: true };
        }
      } catch (e) {
        console.warn("[persistEscrowPayment] Idempotency check failed, proceeding anyway:", e);
      }
    }

    let grossAmount = 0;
    let targetCreatorId: string | null = null;
    let targetBrandId: string | null = user?.user_id || null;

    if (supabase) {
      try {
        let checkDealId = deal_id || thread_id;
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
        if (thread_id && (!grossAmount || grossAmount <= 0)) {
          const { data: threadRec } = await supabase.from('chat_threads').select('*').eq('id', thread_id).maybeSingle();
          if (threadRec) {
            const parsed = parseThreadState(threadRec);
            grossAmount = Number(threadRec.agreed_amount || threadRec.amount_fixed || parsed.amount_fixed) || 0;
            if (threadRec.creator_id) targetCreatorId = threadRec.creator_id;
            if (threadRec.brand_id) targetBrandId = threadRec.brand_id;
          }
        }
      } catch (e) {
        console.warn("[persistEscrowPayment] DB lookup error:", e);
      }
    }

    if (!grossAmount || grossAmount <= 0) {
`;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);
console.log("Fixed missing code");
