import express from "express";

// Thin route-registration wiring for the UGC order lifecycle (and the one
// Campaign-Deal content-approval route that shares this naming pattern).
//
// This file intentionally does NOT contain any of the actual business
// logic — every route here just forwards to an already-existing handler
// function (handleUgcOrderApprove, handleUgcDeliverableSubmit, etc.) that
// still lives in server.ts, passed in as a dependency. This makes the
// move essentially zero-risk: we're only relocating *where a route path
// is registered*, never touching what it actually does.
//
// The handler functions themselves are much bigger and reach deep into
// server.ts's shared state (supabase, db, syncUgcLifecycleEvent, etc.) —
// extracting THEM safely is a separate, more involved task for later.
export function setupUgcOrderRoutes(
  app: express.Application,
  router: express.Router,
  {
    handleThreadApproveContent,
    handleUgcDeliverableSubmit,
    handleUgcOrderApprove,
    handleUgcOrderRevision,
    handleUgcOrderDeclineRevisions,
    handleUgcOrderCancel,
  }: {
    handleThreadApproveContent: (req: express.Request, res: express.Response) => any;
    handleUgcDeliverableSubmit: (req: express.Request, res: express.Response) => any;
    handleUgcOrderApprove: (req: express.Request, res: express.Response) => any;
    handleUgcOrderRevision: (req: express.Request, res: express.Response) => any;
    handleUgcOrderDeclineRevisions: (req: express.Request, res: express.Response) => any;
    handleUgcOrderCancel: (req: express.Request, res: express.Response) => any;
  }
) {
  router.post("/chat/v2/threads/:threadId/content/approve", (req, res) => handleThreadApproveContent(req, res));
  router.post(["/ugc/orders/:id/submit", "/ugc/order/:id/submit"], handleUgcDeliverableSubmit);
  router.post(["/chat/v2/threads/:threadId/submit-content", "/chat/v2/threads/:threadId/submit-draft"], handleUgcDeliverableSubmit);
  router.post(["/ugc/orders/:id/approve", "/ugc/order/:id/approve", "/chat/v2/threads/:id/mark-complete"], handleUgcOrderApprove);
  router.post(["/ugc/orders/:id/revision", "/ugc/order/:id/revision", "/chat/v2/threads/:id/reject-content", "/chat/v2/threads/:id/request-revision"], handleUgcOrderRevision);
  router.post(["/ugc/orders/:id/decline-revisions", "/ugc/order/:id/decline-revisions", "/chat/v2/threads/:id/decline-revisions"], handleUgcOrderDeclineRevisions);
  router.post(["/ugc/orders/:id/cancel-claim", "/ugc/order/:id/cancel-claim", "/ugc/orders/:id/cancel", "/ugc/order/:id/cancel", "/chat/v2/threads/:id/cancel-claim", "/chat/v2/threads/:id/cancel-order"], handleUgcOrderCancel);
}

// UGC brief browsing, order claiming/signing, brand/creator order listing,
// UGC-specific earnings/showcase views, and the internal ops-team pages
// (admin/ugc/orders, and the hyphenated /ugc-orders/... internal team
// flow). This is the "browse and discover" half of the UGC domain — the
// lifecycle-action routes (approve/revision/decline/cancel) already live
// in setupUgcOrderRoutes below, in this same file.
export function setupUgcBrowseRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    ensureUGCChatThread,
    enrichBriefsWithBrandProfiles,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    ensureUGCChatThread: (order: any, brief: any, user: any, io: any) => Promise<any>;
    enrichBriefsWithBrandProfiles: (briefs: any[]) => Promise<any[]>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  router.post("/ugc-orders/:orderId/in-house", async (req, res) => {
    const { orderId } = req.params;
    const db = getDb();
    let order = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    if (order) {
      order.in_house_assigned = true;
      order.status = "IN_HOUSE_ASSIGNED";
      saveDb(db);
    } else {
      const brief = (db.ugc_briefs || []).find((b: any) => b.id === orderId);
      if (brief) {
        const newOrder = {
          id: 'ugcord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
          brief_id: brief.id,
          brand_id: brief.brand_id,
          creator_id: '8ebacafb-aa65-4b4b-a046-1e1bea9cc3dc',
          creator_payout: brief.budget || 50000,
          agreed_amount: brief.budget || 50000,
          status: "IN_HOUSE_ASSIGNED",
          in_house_assigned: true,
          created_at: getIsoNow()
        };
        if (!db.ugc_orders) db.ugc_orders = [];
        db.ugc_orders.unshift(newOrder);
        saveDb(db);
      }
    }
    res.json({ ok: true, message: "In-house SLA override triggered" });
  });


  router.post("/ugc/briefs", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required", detail: "Please log in to post a UGC brief." });
    }

    const body = req.body || {};
    const briefId = `brief_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    const deliverableType = body.deliverable_type || "collaboration_reel";
    const budget = Math.max(1, Number(body.budget) || 1);
    const maxCreators = Math.max(1, Number(body.max_creators) || 1);
    const totalBudget = Number(body.total_budget) || (budget * maxCreators);
    const brandName = user.name || user.company_name || body.brand_name || "Brand Partner";

    const newBrief = {
      id: briefId,
      brand_id: user.user_id,
      brand_name: brandName,
      title: body.title || `Review of ${body.product_name || "Product"}`,
      product_name: body.product_name || "",
      product_description: body.product_description || "",
      detailed_requirements: body.detailed_requirements || "",
      sample_content_url: body.sample_content_url || "",
      deliverable_type: deliverableType,
      video_duration: body.video_duration || "30s",
      budget: budget,
      max_creators: maxCreators,
      claimed_count: 0,
      status: 'OPEN',
      dos: Array.isArray(body.dos) ? body.dos.filter((d: any) => typeof d === 'string' && d.trim().length > 0) : [],
      donts: Array.isArray(body.donts) ? body.donts.filter((d: any) => typeof d === 'string' && d.trim().length > 0) : [],
      created_at: getIsoNow()
    };

    if (supabase) {
      try {
        const { error } = await (privilegedSupabase || supabase).from('ugc_briefs').insert(newBrief);
        if (error) {
          console.error("[POST /ugc/briefs] Supabase insert error:", error);
        }
      } catch (err) {
        console.error("[POST /ugc/briefs] Supabase insert caught error:", err);
      }
    }

    const db = getDb();
    if (!db.ugc_briefs) db.ugc_briefs = [];
    db.ugc_briefs.unshift(newBrief);

    // Record Escrow transaction in db.transactions
    if (!db.transactions) db.transactions = [];
    db.transactions.unshift({
      id: crypto.randomUUID(),
      transaction_id: `txn_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      brief_id: briefId,
      brand_id: user.user_id,
      gross_amount: totalBudget,
      platform_fee_amount: 0,
      creator_net_amount: totalBudget,
      gst_amount: 0,
      status: 'SUCCESS',
      escrow_hold: true,
      payout_status: 'PENDING',
      payout_type: 'full',
      created_at: getIsoNow()
    });
    saveDb(db);

    return res.json({ ok: true, brief: newBrief, message: "Brief posted and payment held in Escrow!" });
  });


  router.get("/ugc/briefs/my", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('brand_id', user.user_id)
          .order('created_at', { ascending: false });
        if (!error && data) {
          briefs = data;
        }
      } catch (e) {
        console.error("[GET /ugc/briefs/my] Supabase query error:", e);
      }
    }

    const db = getDb();
    const localBriefs = (db.ugc_briefs || []).filter((b: any) => b.brand_id === user.user_id);
    const combinedMap = new Map();
    briefs.forEach((b: any) => combinedMap.set(b.id, b));
    localBriefs.forEach((b: any) => {
      if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
    });
    const finalBriefs = Array.from(combinedMap.values());

    // Fetch matching orders for applications count
    let allOrders: any[] = [];
    if (supabase) {
      try {
        const { data: ords } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('brand_id', user.user_id);
        if (ords) allOrders = ords;
      } catch (e) {}
    }
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.brand_id === user.user_id);
    const allOrdersMap = new Map();
    allOrders.forEach((o: any) => allOrdersMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      if (!allOrdersMap.has(o.id)) allOrdersMap.set(o.id, o);
    });
    const mergedOrders = Array.from(allOrdersMap.values());

    const populatedBriefs = finalBriefs.map((b: any) => {
      const matching = mergedOrders.filter((o: any) => o.brief_id === b.id);
      return {
        ...b,
        orders: matching,
        applications: matching.map((o: any) => ({
          creator_id: o.creator_id,
          creator_name: o.creator_name || "Verified UGC Creator",
          status: o.status,
          order_id: o.id
        }))
      };
    });

    const enriched = await enrichBriefsWithBrandProfiles(populatedBriefs);
    return res.json(enriched);
  });


  router.get("/ugc/briefs/available", async (req, res) => {
    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false });
        if (!error && data) {
          briefs = data;
        }
      } catch (e) {
        console.error("[GET /ugc/briefs/available] Supabase error:", e);
      }
    }

    const db = getDb();
    const localBriefs = (db.ugc_briefs || []).filter((b: any) => (b.status || 'OPEN') === 'OPEN');
    const combinedMap = new Map();
    briefs.forEach((b: any) => combinedMap.set(b.id, b));
    localBriefs.forEach((b: any) => {
      if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
    });
    const finalBriefs = Array.from(combinedMap.values()).filter((b: any) => {
      const maxC = Number(b.max_creators) || 1;
      const claimedC = Number(b.claimed_count) || 0;
      return claimedC < maxC;
    });

    const enriched = await enrichBriefsWithBrandProfiles(finalBriefs);
    return res.json(enriched);
  });


  router.get("/ugc/briefs/:id", async (req, res) => {
    const { id } = req.params;
    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', id).maybeSingle();
        if (data) brief = data;
      } catch (e) {}
    }
    if (!brief) {
      const db = getDb();
      brief = (db.ugc_briefs || []).find((b: any) => b.id === id);
    }
    if (!brief) return res.status(404).json({ error: "UGC Brief not found" });

    const [enriched] = await enrichBriefsWithBrandProfiles([brief]);
    return res.json(enriched || brief);
  });


  router.get("/ugc/orders/brand", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('brand_id', user.user_id)
          .order('created_at', { ascending: false });
        if (data) orders = data;
      } catch (e) {}
    }

    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.brand_id === user.user_id);
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      if (!combinedMap.has(o.id)) combinedMap.set(o.id, o);
    });
    const finalOrders = Array.from(combinedMap.values());

    const populated = await Promise.all(finalOrders.map(async (o: any) => {
      let brief = null;
      if (supabase && o.brief_id) {
        try {
          const { data: b } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', o.brief_id).maybeSingle();
          if (b) brief = b;
        } catch(e) {}
      }
      if (!brief) {
        brief = (db.ugc_briefs || []).find((b: any) => b.id === o.brief_id);
      }
      let creator = null;
      if (supabase && o.creator_id) {
        try {
          const { data: c } = await (privilegedSupabase || supabase).from('users').select('id, user_id, name, avatar, email').or(`id.eq.${o.creator_id},user_id.eq.${o.creator_id}`).maybeSingle();
          if (c) creator = c;
        } catch(e) {}
      }
      if (!creator) {
        creator = (db.users || []).find((u: any) => u.user_id === o.creator_id || u.id === o.creator_id);
      }
      return {
        ...o,
        thread_id: o.id,
        threadId: o.id,
        brief: brief || { title: "UGC Brief", budget: o.creator_payout || 0, deliverable_type: "collaboration_reel" },
        creator: creator || { name: "Verified UGC Creator" },
        creator_name: creator?.name || "Verified UGC Creator",
        // NOTE: brand_status must stay a raw, underscore-style status token (e.g. 'SUBMITTED',
        // 'REVISION_REQUESTED') identical to `status` — the frontend's stage classifier
        // (BrandUGCOrders.jsx / BrandInstantUGC.jsx) matches against these exact tokens.
        // Do NOT convert this into a human-readable label like 'IN PRODUCTION' / 'PENDING APPROVAL'
        // here — that previously broke the Approve/Request-Changes button state after a brand
        // requested a revision and the creator resubmitted, because the label didn't match any
        // known stage and the order silently fell back to the wrong stage.
        brand_status: o.status
      };
    }));

    return res.json(populated);
  });


  router.get("/ugc/orders/creator", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('creator_id', user.user_id)
          .order('created_at', { ascending: false });
        if (data) orders = data;
      } catch (e) {}
    }

    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.creator_id === user.user_id);
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      if (!combinedMap.has(o.id)) combinedMap.set(o.id, o);
    });
    const finalOrders = Array.from(combinedMap.values());

    const populated = await Promise.all(finalOrders.map(async (o: any) => {
      let brief = null;
      if (supabase && o.brief_id) {
        try {
          const { data: b } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', o.brief_id).maybeSingle();
          if (b) brief = b;
        } catch(e) {}
      }
      if (!brief) {
        brief = (db.ugc_briefs || []).find((b: any) => b.id === o.brief_id);
      }
      if (brief) {
        const [enrichedBrief] = await enrichBriefsWithBrandProfiles([brief]);
        if (enrichedBrief) brief = enrichedBrief;
      }
      let brand = null;
      if (supabase && o.brand_id) {
        try {
          const { data: br } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', o.brand_id).maybeSingle();
          if (br) brand = br;
        } catch(e) {}
      }
      const bLogo = brief?.brand_logo || brand?.logo || null;
      return {
        ...o,
        thread_id: o.id,
        threadId: o.id,
        brief: brief || { title: "UGC Brief", budget: o.creator_payout || 0, brand_logo: bLogo },
        brand: brand || { company_name: brief?.brand_name || "Brand Partner", logo: bLogo },
        brand_name: brand?.company_name || brief?.brand_name || "Brand Partner",
        brand_logo: bLogo,
        stage: o.status === 'SUBMITTED' ? 'IN_REVIEW' : (o.status === 'ACCEPTED' ? 'IN_PROGRESS' : o.status)
      };
    }));

    return res.json(populated);
  });


  router.get(["/ugc/orders/:id", "/ugc/order/:id"], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    let order: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${id},brief_id.eq.${id}`)
          .maybeSingle();
        if (data) order = data;
      } catch (e) {}
    }
    const db = getDb();
    const localOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.brief_id === id);
    if (!order && localOrder) order = localOrder;
    else if (order && localOrder) order = { ...localOrder, ...order };

    if (!order) return res.status(404).json({ error: "Order not found" });
    return res.json(order);
  });


  router.post("/ugc/orders/claim", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const { brief_id, signature } = req.body;
    if (!brief_id) return res.status(400).json({ error: "brief_id is required" });

    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', brief_id).maybeSingle();
        if (data) brief = data;
      } catch(e) {}
    }
    const db = getDb();
    if (!brief) {
      brief = (db.ugc_briefs || []).find((b: any) => b.id === brief_id);
    }
    if (!brief) return res.status(404).json({ error: "Brief not found" });

    if (brief.brand_id === user.user_id) {
      return res.status(400).json({ error: "You cannot claim your own brief." });
    }

    const maxC = Number(brief.max_creators) || 1;
    const claimedC = Number(brief.claimed_count) || 0;
    if (claimedC >= maxC || brief.status !== 'OPEN') {
      return res.status(400).json({ error: "This brief has already reached creator capacity." });
    }

    const orderId = `ugcord_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    const nowIso = getIsoNow();
    const payout = Number(brief.budget) || 1;

    const newOrder = {
      id: orderId,
      brief_id: brief.id,
      brand_id: brief.brand_id,
      creator_id: user.user_id,
      status: 'ACCEPTED',
      creator_payout: payout,
      agreed_amount: payout,
      escrow_amount: payout,
      escrow_hold: true,
      escrow_held_at: nowIso,
      payment_status: 'ESCROW_HELD',
      agreement_signed_creator: true,
      internal_deadline: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
      revision_count: 5,
      revisions_used: 0,
      created_at: nowIso
    };

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('ugc_orders').insert(newOrder);
        const newClaimCount = claimedC + 1;
        const newStatus = newClaimCount >= maxC ? 'CLAIMED' : 'OPEN';
        await (privilegedSupabase || supabase).from('ugc_briefs').update({
          claimed_count: newClaimCount,
          status: newStatus
        }).eq('id', brief.id);
      } catch(e) {
        console.error("[POST /ugc/orders/claim] Supabase error:", e);
      }
    }

    if (!db.ugc_orders) db.ugc_orders = [];
    db.ugc_orders.unshift(newOrder);
    const localBrief = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
    if (localBrief) {
      localBrief.claimed_count = (localBrief.claimed_count || 0) + 1;
      if (localBrief.claimed_count >= (localBrief.max_creators || 1)) {
        localBrief.status = 'CLAIMED';
      }
    }
    saveDb(db);

    // Create dedicated UGC chat thread immediately
    await ensureUGCChatThread(newOrder, brief, user, req.app.get("io"));

    return res.json({ ok: true, order_id: orderId, thread_id: orderId, order: newOrder, message: "Brief successfully claimed!" });
  });


  router.post("/ugc/orders/:id/sign", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { signature } = req.body;

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          agreement_signed_creator: true,
          status: 'ACCEPTED'
        }).eq('id', id);
      } catch(e) {}
    }
    const db = getDb();
    const order = (db.ugc_orders || []).find((o: any) => o.id === id);
    if (order) {
      order.agreement_signed_creator = true;
      order.status = 'ACCEPTED';
      saveDb(db);
    }

    // Ensure dedicated chat thread is created on signing
    let fullOrder = order;
    if (!fullOrder && supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', id).maybeSingle();
        if (data) fullOrder = data;
      } catch (e) {}
    }
    if (fullOrder) {
      await ensureUGCChatThread(fullOrder, null, user, req.app.get("io"));
    }

    return res.json({ ok: true, order_id: id, thread_id: id, message: "Agreement signed" });
  });


  router.get("/ugc/earnings", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('creator_id', user.user_id)
          .eq('status', 'COMPLETED');
        if (data) orders = data;
      } catch(e) {}
    }
    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.creator_id === user.user_id && o.status === 'COMPLETED');
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      if (!combinedMap.has(o.id)) combinedMap.set(o.id, o);
    });
    const finalOrders = Array.from(combinedMap.values());

    return res.json(finalOrders);
  });


  router.get("/ugc/showcase", async (req, res) => {
    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').limit(12);
        if (data) briefs = data;
      } catch(e) {}
    }
    const db = getDb();
    if (briefs.length === 0) {
      briefs = (db.ugc_briefs || []).slice(0, 12);
    }
    return res.json(briefs);
  });


  router.get("/admin/ugc/orders", async (req, res) => {
    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').order('created_at', { ascending: false });
        if (data) orders = data;
      } catch(e) {}
    }
    const db = getDb();
    const localOrders = db.ugc_orders || [];
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      if (!combinedMap.has(o.id)) combinedMap.set(o.id, o);
    });
    return res.json(Array.from(combinedMap.values()));
  });


  router.post("/admin/ugc/orders/:id/team-upload", async (req, res) => {
    const { id } = req.params;
    const { videoUrl, notes } = req.body;
    const nowIso = getIsoNow();
    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          video_url: videoUrl,
          creator_notes: notes || "Team SLA Upload",
          status: 'SUBMITTED',
          delivered_at: nowIso
        }).eq('id', id);
      } catch(e) {}
    }
    const db = getDb();
    const order = (db.ugc_orders || []).find((o: any) => o.id === id);
    if (order) {
      order.video_url = videoUrl;
      order.creator_notes = notes || "Team SLA Upload";
      order.status = 'SUBMITTED';
      order.delivered_at = nowIso;
      saveDb(db);
    }
    return res.json({ ok: true, message: "Team upload saved" });
  });


  router.get("/ugc-orders", async (req, res) => {
    const viewer = await parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });

    const db = getDb();
    let briefs: any[] = [];
    let orders: any[] = [];
    let brands: any[] = [];
    let creators: any[] = [];

    if (supabase) {
      try {
        const [rawBriefs, rawOrders, rawBrands, rawCreators] = await Promise.all([
          (privilegedSupabase || supabase).from('ugc_briefs').select('*'),
          (privilegedSupabase || supabase).from('ugc_orders').select('*'),
          (privilegedSupabase || supabase).from('brand_profiles').select('*'),
          (privilegedSupabase || supabase).from('users').select('user_id, name').eq('role', 'creator')
        ]);
        if (rawBriefs.data) briefs = rawBriefs.data;
        if (rawOrders.data) orders = rawOrders.data;
        if (rawBrands.data) brands = rawBrands.data;
        if (rawCreators.data) creators = rawCreators.data;
      } catch (e: any) {
        console.warn("[ugc-orders] Supabase fetch error:", e);
      }
    }

    // Merge with local db briefs
    const briefMap = new Map(briefs.map((b: any) => [b.id, b]));
    (db.ugc_briefs || []).forEach((lb: any) => {
      if (!briefMap.has(lb.id)) {
        briefMap.set(lb.id, lb);
        briefs.push(lb);
      }
    });

    // Map orders by brief_id and id, prioritizing newest and local updates
    const orderMap = new Map<string, any>();
    orders.forEach((o: any) => {
      if (o.brief_id) orderMap.set(o.brief_id, o);
      if (o.id) orderMap.set(o.id, o);
    });
    (db.ugc_orders || []).forEach((lo: any) => {
      if (lo.brief_id) {
        const existing = orderMap.get(lo.brief_id);
        orderMap.set(lo.brief_id, existing ? { ...existing, ...lo } : lo);
      }
      if (lo.id) {
        const existing = orderMap.get(lo.id);
        orderMap.set(lo.id, existing ? { ...existing, ...lo } : lo);
      }
    });

    const brandMap = new Map(brands.map((b: any) => [b.user_id, b]));
    const creatorMap = new Map(creators.map((c: any) => [c.user_id, c.name]));

    const processed = briefs.map((brief: any) => {
      const order = orderMap.get(brief.id) as any;
      const brand = brandMap.get(brief.brand_id) as any;
      const creatorName = order ? (creatorMap.get(order.creator_id) || order.accepted_by_creator_name) : null;
      
      const rawStatus = order?.status || "Open";
      const normalizedStatus = order
        ? (order.in_house_assigned && (rawStatus === 'IN_HOUSE_ASSIGNED' || rawStatus === 'in_house_backup')
            ? 'in_house_backup'
            : rawStatus.toLowerCase())
        : "open";

      return {
        order_id: brief.id,
        brief_id: brief.id,
        brand_user_id: brief.brand_id,
        brand_name: brand?.company_name || brief.brand_name || "Unknown Brand",
        brand_logo: brand?.logo_url || null,
        product_name: brief.product_name || brief.title || "UGC Product",
        instructions: brief.detailed_requirements || brief.product_description || "",
        category: brief.deliverable_type || "Fashion",
        video_length: brief.video_duration || "30s",
        ref_link: brief.sample_content_url || null,
        budget: brief.budget || 0,
        amount: brief.budget || 0,
        creator_name: creatorName || "Unknown Creator",
        accepted_by_creator_id: order?.creator_id || order?.accepted_by_creator_id || null,
        accepted_by_creator_name: creatorName || "Vetted Creator",
        submitted_video_url: order?.video_url || null,
        video_url: order?.video_url || null,
        status: normalizedStatus,
        raw_status: rawStatus,
        in_house_assigned: !!order?.in_house_assigned,
        date: brief.created_at || new Date().toISOString(),
        content_type: brief.content_type || brief.deliverable_type || "Video",
        title: brief.title || brief.product_name || "UGC Campaign"
      };
    });
    return res.json(processed);
  });


  router.post("/ugc-orders/:orderId/accept", async (req, res) => {
    const viewer = await parseAuthUser(req);
    const { orderId } = req.params;
    const nowIso = getIsoNow();

    const db = getDb();
    let order: any = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    let brief: any = (db.ugc_briefs || []).find((b: any) => b.id === orderId || (order && b.id === order.brief_id));

    if (supabase) {
      try {
        if (!order) {
          const { data: supaOrder } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('*')
            .or(`id.eq.${orderId},brief_id.eq.${orderId}`)
            .maybeSingle();
          if (supaOrder) order = supaOrder;
        }
        if (!brief) {
          const targetBriefId = order?.brief_id || orderId;
          const { data: supaBrief } = await (privilegedSupabase || supabase)
            .from('ugc_briefs')
            .select('*')
            .eq('id', targetBriefId)
            .maybeSingle();
          if (supaBrief) brief = supaBrief;
        }
      } catch (e) {
        console.warn("[POST /ugc-orders/:orderId/accept] Supabase lookup error:", e);
      }
    }

    // Determine creator ID for in-house assignment
    const candidateCreatorId = viewer?.user_id;
    const briefBrandId = brief?.brand_id || order?.brand_id;
    // Ensure creator_id != brand_id to satisfy check constraint and foreign key
    const assignedCreatorId = (candidateCreatorId && candidateCreatorId !== briefBrandId)
      ? candidateCreatorId
      : '8ebacafb-aa65-4b4b-a046-1e1bea9cc3dc'; // valid verified creator
    const creatorName = viewer?.name || 'In-House Ops';

    if (!order && !brief) {
      // In-house ops convention: create order record if neither order nor brief exists
      const newOrderId = orderId.startsWith('ugcord_') ? orderId : 'ugcord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const newOrder: any = {
        id: newOrderId,
        brief_id: orderId,
        brand_id: 'dev-user-id-12345',
        creator_id: assignedCreatorId,
        creator_payout: 50000,
        agreed_amount: 50000,
        status: 'ACCEPTED',
        in_house_assigned: true,
        agreement_signed_creator: true,
        revision_count: 5,
        revisions_used: 0,
        created_at: nowIso,
        accepted_at: nowIso,
        accepted_by_creator_id: viewer?.user_id || assignedCreatorId,
        accepted_by_creator_name: creatorName
      };
      if (!db.ugc_orders) db.ugc_orders = [];
      db.ugc_orders.unshift(newOrder);
      saveDb(db);
      order = newOrder;
    }

    if (order) {
      // Existing order -> update status and in-house assignment
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('ugc_orders').update({
            status: 'ACCEPTED',
            agreement_signed_creator: true
          }).eq('id', order.id);
        } catch (e) {
          console.warn("[POST /ugc-orders/:orderId/accept] Supabase update error:", e);
        }
      }

      order.status = 'ACCEPTED';
      order.in_house_assigned = true;
      order.agreement_signed_creator = true;
      order.accepted_at = nowIso;
      order.accepted_by_creator_id = viewer?.user_id || assignedCreatorId;
      order.accepted_by_creator_name = creatorName;

      // Update local db
      if (!db.ugc_orders) db.ugc_orders = [];
      const locIdx = db.ugc_orders.findIndex((o: any) => o.id === order.id || o.brief_id === order.brief_id);
      if (locIdx >= 0) {
        db.ugc_orders[locIdx] = { ...db.ugc_orders[locIdx], ...order };
      } else {
        db.ugc_orders.unshift(order);
      }
      saveDb(db);
    } else if (brief) {
      // Create new ugc_orders record for this brief
      const newOrderId = 'ugcord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const newOrder: any = {
        id: newOrderId,
        brief_id: brief.id,
        brand_id: brief.brand_id,
        creator_id: assignedCreatorId,
        creator_payout: brief.budget || 50000,
        agreed_amount: brief.budget || 50000,
        status: 'ACCEPTED',
        in_house_assigned: true,
        agreement_signed_creator: true,
        revision_count: 5,
        revisions_used: 0,
        created_at: nowIso,
        accepted_at: nowIso,
        accepted_by_creator_id: viewer?.user_id || assignedCreatorId,
        accepted_by_creator_name: creatorName
      };

      if (supabase) {
        try {
          const supaPayload = {
            id: newOrderId,
            brief_id: brief.id,
            brand_id: brief.brand_id,
            creator_id: assignedCreatorId,
            creator_payout: brief.budget || 50000,
            agreed_amount: brief.budget || 50000,
            status: 'ACCEPTED',
            agreement_signed_creator: true,
            revision_count: 5,
            revisions_used: 0,
            created_at: nowIso
          };
          await (privilegedSupabase || supabase).from('ugc_orders').insert(supaPayload);
          await (privilegedSupabase || supabase).from('ugc_briefs').update({
            claimed_count: (brief.claimed_count || 0) + 1,
            status: 'CLAIMED'
          }).eq('id', brief.id);
        } catch (e) {
          console.warn("[POST /ugc-orders/:orderId/accept] Supabase insert error:", e);
        }
      }

      if (!db.ugc_orders) db.ugc_orders = [];
      db.ugc_orders.unshift(newOrder);

      const localBrief = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
      if (localBrief) {
        localBrief.claimed_count = (localBrief.claimed_count || 0) + 1;
        localBrief.status = 'CLAIMED';
      }
      saveDb(db);
      order = newOrder;
    }

    return res.json({
      ok: true,
      success: true,
      order_id: order?.id || orderId,
      brief_id: brief?.id || order?.brief_id || orderId,
      status: 'ACCEPTED',
      in_house_assigned: true,
      order,
      message: "Order claimed/accepted for in-house handling"
    });
  });


  router.post("/ugc-orders/:orderId/submit", async (req, res) => {
    const viewer = await parseAuthUser(req);
    const { orderId } = req.params;
    const { video_url, videoUrl, notes } = req.body || {};
    const url = (video_url || videoUrl || "").toString().trim();

    if (!url) {
      return res.status(400).json({ error: "video_url is required" });
    }

    const nowIso = getIsoNow();
    const db = getDb();
    let order: any = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    let brief: any = (db.ugc_briefs || []).find((b: any) => b.id === orderId || (order && b.id === order.brief_id));

    if (supabase) {
      try {
        if (!order) {
          const { data: supaOrder } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('*')
            .or(`id.eq.${orderId},brief_id.eq.${orderId}`)
            .maybeSingle();
          if (supaOrder) order = supaOrder;
        }
        if (!brief) {
          const targetBriefId = order?.brief_id || orderId;
          const { data: supaBrief } = await (privilegedSupabase || supabase)
            .from('ugc_briefs')
            .select('*')
            .eq('id', targetBriefId)
            .maybeSingle();
          if (supaBrief) brief = supaBrief;
        }
      } catch (e) {
        console.warn("[POST /ugc-orders/:orderId/submit] Supabase lookup error:", e);
      }
    }

    if (!order && !brief) {
      // In-house ops convention: create order record if neither order nor brief exists
      const newOrderId = orderId.startsWith('ugcord_') ? orderId : 'ugcord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const assignedCreatorId = (viewer?.user_id && viewer.user_id !== 'dev-user-id-12345')
        ? viewer.user_id
        : '8ebacafb-aa65-4b4b-a046-1e1bea9cc3dc';
      const newOrder: any = {
        id: newOrderId,
        brief_id: orderId,
        brand_id: 'dev-user-id-12345',
        creator_id: assignedCreatorId,
        creator_payout: 50000,
        agreed_amount: 50000,
        video_url: url,
        status: 'SUBMITTED',
        in_house_assigned: true,
        delivered_at: nowIso,
        created_at: nowIso,
        creator_notes: notes || "Deliverable submitted"
      };
      if (!db.ugc_orders) db.ugc_orders = [];
      db.ugc_orders.unshift(newOrder);
      saveDb(db);
      order = newOrder;
    }

    if (order) {
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('ugc_orders').update({
            video_url: url,
            status: 'SUBMITTED',
            delivered_at: nowIso,
            creator_notes: notes || order.creator_notes || "Deliverable submitted"
          }).eq('id', order.id);
        } catch (e) {
          console.warn("[POST /ugc-orders/:orderId/submit] Supabase update error:", e);
        }
      }

      order.video_url = url;
      order.status = 'SUBMITTED';
      order.delivered_at = nowIso;
      order.creator_notes = notes || order.creator_notes || "Deliverable submitted";

      if (!db.ugc_orders) db.ugc_orders = [];
      const locIdx = db.ugc_orders.findIndex((o: any) => o.id === order.id || o.brief_id === order.brief_id);
      if (locIdx >= 0) {
        db.ugc_orders[locIdx] = { ...db.ugc_orders[locIdx], ...order };
      } else {
        db.ugc_orders.unshift(order);
      }
      saveDb(db);
    } else if (brief) {
      const newOrderId = 'ugcord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const assignedCreatorId = (viewer?.user_id && viewer.user_id !== brief.brand_id)
        ? viewer.user_id
        : '8ebacafb-aa65-4b4b-a046-1e1bea9cc3dc';

      const newOrder: any = {
        id: newOrderId,
        brief_id: brief.id,
        brand_id: brief.brand_id,
        creator_id: assignedCreatorId,
        creator_payout: brief.budget || 50000,
        agreed_amount: brief.budget || 50000,
        video_url: url,
        status: 'SUBMITTED',
        in_house_assigned: true,
        delivered_at: nowIso,
        created_at: nowIso,
        creator_notes: notes || "Deliverable submitted"
      };

      if (supabase) {
        try {
          const supaPayload = {
            id: newOrderId,
            brief_id: brief.id,
            brand_id: brief.brand_id,
            creator_id: assignedCreatorId,
            creator_payout: brief.budget || 50000,
            agreed_amount: brief.budget || 50000,
            video_url: url,
            status: 'SUBMITTED',
            delivered_at: nowIso,
            created_at: nowIso
          };
          await (privilegedSupabase || supabase).from('ugc_orders').insert(supaPayload);
        } catch (e) {
          console.warn("[POST /ugc-orders/:orderId/submit] Supabase insert error:", e);
        }
      }

      if (!db.ugc_orders) db.ugc_orders = [];
      db.ugc_orders.unshift(newOrder);
      saveDb(db);
      order = newOrder;
    }

    return res.json({
      ok: true,
      success: true,
      order_id: order?.id || orderId,
      brief_id: brief?.id || order?.brief_id || orderId,
      status: 'SUBMITTED',
      video_url: url,
      order,
      message: "Deliverable video submitted successfully"
    });
  });

}
