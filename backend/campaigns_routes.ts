import express from "express";
import crypto from "crypto";
import { calculateCampaignStats } from "./helpers";

// Campaign CRUD and application routes: updating/submitting a draft
// campaign, creating and listing campaigns, viewing a single campaign
// (two variants for different URL shapes), tracking a view, listing/
// acting on applications, and a creator applying to a campaign.
export function setupCampaignsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    sendNotification,
    serializeChatMessage,
    insertChatMessageToSupabase,
    syncEntityTags,
    getActingBrandId,
    createEscrowTransaction,
    isCreatorKycVerified,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any>;
    serializeChatMessage: (a?: any, b?: any, c?: any, d?: any) => any;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
    syncEntityTags: (entityType: string, entityId: string, tags: any[]) => Promise<any>;
    getActingBrandId: (user: any) => any;
    createEscrowTransaction: (a?: any, b?: any, c?: any) => Promise<any>;
    isCreatorKycVerified: (id: string) => Promise<boolean>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  router.post("/campaigns/:id/update", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Not authorized", _status: 403 });
    const actingId = getActingBrandId(user);
    const campaignId = req.params.id;

    if (supabase) {
      const { data: existing, error: fetchErr } = await (privilegedSupabase || supabase).from('campaigns').select('*').eq('campaign_id', campaignId).single();
      if (fetchErr || !existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized to edit this campaign" });

      const updates = {
        title: req.body.title,
        description: req.body.description,
        budget_min: Number(req.body.budget_min) || 2000,
        budget_max: Number(req.body.budget_max) || 5000,
        deliverables: req.body.deliverables || [],
        categories: req.body.categories || [],
        platforms: req.body.platforms || [],
        deadline: req.body.deadline || null,
        language: req.body.language || "Hindi",
        status: req.body.status === "draft" ? "draft" : "under_review"
      };

      const { error } = await (privilegedSupabase || supabase).from('campaigns').update(updates).eq('campaign_id', campaignId);
      if (error) {
        console.error("Error updating campaign:", error);
        return res.status(500).json({ error: error.message });
      }
      
      const db = getDb();
      try {
        const reviewMsg = `Your updated campaign '${updates.title || existing.title}' has been submitted for re-review. It will be live again shortly.`;
        await sendNotification(db, actingId, "CAMPAIGN_UNDER_REVIEW", reviewMsg);
      } catch (notifErr) {
        console.error("Error sending notification:", notifErr);
      }
      
      if (Array.isArray(updates.categories)) {
        (async () => {
          try {
            const tags = updates.categories.map((c: string) => ({ name: c, type: 'niche' as const }));
            await syncEntityTags('campaign_brief', campaignId, tags);
          } catch (e) {
            console.error("Error syncing campaign update tags:", e);
          }
        })();
      }
      return res.json({ success: true, ...updates });
    } else {
      const db = getDb();
      const existing = db.campaigns?.find(c => String(c.campaign_id) === String(campaignId) || String(c.id) === String(campaignId));
      if (!existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized", _status: 403 });

      Object.assign(existing, {
        title: req.body.title,
        description: req.body.description,
        budget_min: Number(req.body.budget_min) || 2000,
        budget_max: Number(req.body.budget_max) || 5000,
        deliverables: req.body.deliverables || [],
        categories: req.body.categories || [],
        platforms: req.body.platforms || [],
        deadline: req.body.deadline || null,
        language: req.body.language || "Hindi",
        status: req.body.status === "draft" ? "draft" : "under_review",
        stage: "Pending"
      });
      saveDb(db);
      if (Array.isArray(existing.categories)) {
        (async () => {
          try {
            const tags = existing.categories.map((c: string) => ({ name: c, type: 'niche' as const }));
            await syncEntityTags('campaign_brief', campaignId, tags);
          } catch (e) {
            console.error("Error syncing campaign fallback update tags:", e);
          }
        })();
      }
      return res.json({ success: true, ...existing });
    }
  });


  router.post("/campaigns/:id/submit-draft", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Not authorized", _status: 403 });
    const actingId = getActingBrandId(user);
    const campaignId = req.params.id;

    // Check brand KYC status
    let isApproved = Boolean(user?.kyc_verified || user?.kyc_status === "approved" || user?.kyc_status === "APPROVED");
    if (!isApproved && supabase) {
      const { data: bKyc } = await supabase
        .from('brand_kyc')
        .select('status')
        .eq('brand_id', actingId)
        .maybeSingle();
      if (bKyc && (bKyc.status === "approved" || bKyc.status === "APPROVED")) {
        isApproved = true;
      }
    }
    if (!isApproved) {
      return res.status(403).json({ 
        error: "KYC_REQUIRED", 
        detail: "Please complete your corporate KYC verification before launching campaign drafts." 
      });
    }

    if (supabase) {
      const { data: existing, error: fetchErr } = await (privilegedSupabase || supabase).from('campaigns').select('*').eq('campaign_id', campaignId).single();
      if (fetchErr || !existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized to launch this campaign" });

      const { error } = await (privilegedSupabase || supabase).from('campaigns').update({ status: 'live' }).eq('campaign_id', campaignId);
      if (error) return res.status(500).json({ error: error.message });
      
      return res.json({ success: true, status: 'live' });
    } else {
      const db = getDb();
      const existing = db.campaigns?.find(c => String(c.campaign_id) === String(campaignId) || String(c.id) === String(campaignId));
      if (!existing) return res.status(404).json({ detail: "Campaign not found" });
      if (existing.brand_user_id !== actingId) return res.status(403).json({ detail: "Not authorized", _status: 403 });

      existing.status = 'live';
      saveDb(db);
      return res.json({ success: true, status: 'live' });
    }
  });


  router.post("/campaigns", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Only brands can post campaigns" });
    const actingId = getActingBrandId(user);
    
    // If not draft, enforce KYC verification
    if (req.body.status !== "draft") {
      let isApproved = Boolean(user?.kyc_verified || user?.kyc_status === "approved" || user?.kyc_status === "APPROVED");
      if (!isApproved && supabase) {
        const { data: bKyc } = await supabase
          .from('brand_kyc')
          .select('status')
          .eq('brand_id', actingId)
          .maybeSingle();
        if (bKyc && (bKyc.status === "approved" || bKyc.status === "APPROVED")) {
          isApproved = true;
        }
      }
      if (!isApproved) {
        return res.status(403).json({ 
          error: "KYC_REQUIRED", 
          detail: "Please complete your corporate KYC verification before creating or publishing campaigns." 
        });
      }
    }
    
    let bp = null;
    if (supabase) {
      const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', actingId).maybeSingle();
      bp = data;
    }
    
    const cid = crypto.randomUUID();
    const campaign = {
      campaign_id: cid,
      brand_user_id: actingId,
      brand_name: bp?.company_name || user.name,
      brand_logo: bp?.logo || user.picture || "",
      title: req.body.title,
      description: req.body.description,
      budget_min: Number(req.body.budget_min) || 2000,
      budget_max: Number(req.body.budget_max) || 5000,
      deliverables: req.body.deliverables || [],
      categories: req.body.categories || [],
      platforms: req.body.platforms || [],
      deadline: req.body.deadline || null,
      language: req.body.language || "Hindi",
      status: req.body.status === "draft" ? "draft" : "under_review"
    };

    if (supabase) {
      const { error } = await (privilegedSupabase || supabase).from('campaigns').insert(campaign);
      if (error) {
        console.error("Error creating campaign:", error);
        return res.status(500).json({ error: error.message });
      }
    } else {
      const db = getDb();
      if (!db.campaigns) db.campaigns = [];
      db.campaigns.push(campaign);
      saveDb(db);
    }

    // Sync campaign tags
    (async () => {
      try {
        if (Array.isArray(campaign.categories)) {
          const tags = campaign.categories.map((c: string) => ({ name: c, type: 'niche' as const }));
          await syncEntityTags('campaign_brief', cid, tags);
        }
      } catch (err) {
        console.error("Error syncing campaign tags:", err);
      }
    })();

    try {
      const db = getDb();
      const reviewMsg = `Your campaign '${campaign.title || 'New Campaign'}' has been submitted successfully and is currently under review. It will be live in 2-3 hours.`;
      await sendNotification(db, actingId, "CAMPAIGN_UNDER_REVIEW", reviewMsg);
    } catch (notifErr) {
      console.error("Error sending campaign under review notification:", notifErr);
    }

    // Auto-create initial escrow transaction record
    await createEscrowTransaction({
      campaign_id: cid,
      brand_id: actingId,
      gross_amount: campaign.budget_max || campaign.budget_min || 5000,
      status: 'HELD',
      escrow_hold: true
    }).catch(err => console.error("[createEscrowTransaction Error campaigns]", err));

    res.json(campaign);
  });


  router.get("/campaigns", async (req, res) => {

    const viewer = await parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    const { category, platform, city, budget, mine } = req.query;
    
    if (supabase) {
      let query = supabase.from('campaigns').select('*, applicants:campaign_applications(application_id)');
      
      if (mine && viewer) {
        const actingId = getActingBrandId(viewer);
        query = query.eq('brand_user_id', actingId);
      } else {
        query = query.eq('status', 'live');
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.warn("Supabase campaigns table missing or error, falling back to local JSON DB");
      } else {
        let list = data || [];
        try {
          const { data: profiles } = await (privilegedSupabase || supabase).from('brand_profiles').select('user_id, company_name, logo, is_agency');
          if (profiles && profiles.length > 0) {
            const profileMap = new Map();
            profiles.forEach((p: any) => {
              profileMap.set(p.user_id, p);
            });
            list = list.map((c: any) => {
              const bp = profileMap.get(c.brand_user_id);
              if (bp) {
                return {
                  ...c,
                  brand_name: bp.company_name || c.brand_name || "Brand Name",
                  brand_logo: bp.logo || c.brand_logo || "",
                  is_agency: Boolean(bp.is_agency || c.is_agency)
                };
              }
              return c;
            });
          }
        } catch (e) {
          console.error("Error enriching campaigns with brand profiles:", e);
        }

        if (category) list = list.filter((c) => c.categories && c.categories.includes(category));
        if (platform) list = list.filter((c) => c.platforms && c.platforms.includes(platform));
        if (budget) {
          const pBudget = parseInt(budget as string);
          if (pBudget === 10000) list = list.filter((c) => c.budget_min <= 10000);
          else if (pBudget === 30000) list = list.filter((c) => c.budget_min >= 10000 && c.budget_min <= 30000);
          else if (pBudget === 50000) list = list.filter((c) => c.budget_min >= 30000 && c.budget_min <= 50000);
          else if (pBudget === 100000) list = list.filter((c) => c.budget_min > 50000);
        }
        const enrichedList = list.map((item: any) => {
          const stats = calculateCampaignStats(item);
          return { ...item, views: stats.views, applied: stats.applied };
        });
        return res.json(enrichedList);
      }
      

    }

    // Fallback
    const db = getDb();
    let list = db.campaigns || [];
    if (mine && viewer) list = list.filter(c => c.brand_user_id === getActingBrandId(viewer));
    const enrichedFallback = list.slice().reverse().map((item: any) => {
      const stats = calculateCampaignStats(item);
      return { ...item, views: stats.views, applied: stats.applied };
    });
    res.json(enrichedFallback);

  });


  router.get("/campaigns/:id", async (req, res) => {
    const id = req.params.id;
    if (supabase) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('campaign_id', id)
        .maybeSingle();

      if (data) {
        let enriched = { ...data };
        try {
          const { data: bp } = await (privilegedSupabase || supabase)
            .from('brand_profiles')
            .select('user_id, company_name, logo, is_agency')
            .eq('user_id', data.brand_user_id)
            .maybeSingle();
          if (bp) {
            enriched.brand_name = bp.company_name || data.brand_name || "Brand Name";
            enriched.brand_logo = bp.logo || data.brand_logo || "";
            enriched.is_agency = Boolean(bp.is_agency || data.is_agency);
            enriched.brand_is_agency = Boolean(bp.is_agency);
          }
        } catch (e) {
          console.error("Error enriching campaign details:", e);
        }
        const stats = calculateCampaignStats(enriched);
        enriched.views = stats.views;
        enriched.applied = stats.applied;
        return res.json(enriched);
      }
    }

    const db = getDb();
    const c = (db.campaigns || []).find((x: any) => String(x.campaign_id) === String(id) || String(x.id) === String(id));
    if (c) {
      const bp = (db.brand_profiles || []).find((b: any) => String(b.user_id) === String(c.brand_user_id));
      const stats = calculateCampaignStats(c);
      return res.json({
        ...c,
        views: stats.views,
        applied: stats.applied,
        is_agency: Boolean(bp?.is_agency || c.is_agency),
        brand_is_agency: Boolean(bp?.is_agency)
      });
    }
    return res.status(404).json({ detail: "Campaign not found" });
  });


  router.post("/campaigns/:id/track-view", async (req, res) => {
    const db = getDb();
    db.campaigns = db.campaigns || [];
    const idx = db.campaigns.findIndex(c => c.campaign_id === req.params.id);
    if (idx >= 0) {
      db.campaigns[idx].views = (db.campaigns[idx].views || 0) + 1;
      saveDb(db);
      res.json({ ok: true, views: db.campaigns[idx].views });
    } else {
      res.json({ ok: false, detail: "Campaign not found" });
    }
  });


  router.get("/campaigns/:campaign_id/applications", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (supabase) {
      const { data, error } = await supabase
        .from('campaign_applications')
        .select('*, users(name, picture)')
        .eq('campaign_id', req.params.campaign_id)
        .order('created_at', { ascending: false });
        
      if (error) return res.status(500).json({ error: error.message });

      const creatorIds = (data || []).map(a => a.creator_id).filter(Boolean);
      let kycMap: Record<string, any> = {};
      let profileMap: Record<string, any> = {};

      if (creatorIds.length > 0) {
        const [{ data: kycData }, { data: profileData }] = await Promise.all([
          supabase.from('creator_kyc').select('*').in('creator_id', creatorIds),
          supabase.from('creator_profiles').select('*').in('user_id', creatorIds)
        ]);

        if (kycData) {
          kycData.forEach(k => {
            kycMap[k.creator_id] = k;
          });
        }
        if (profileData) {
          profileData.forEach(p => {
            profileMap[p.user_id] = p;
          });
        }
      }
      
      const mapped = (data || []).map(a => {
        const kyc = kycMap[a.creator_id] || {};
        const cp = profileMap[a.creator_id] || {};

        // Resolve followers count from all possible places
        let rawFollowers = 0;
        if (cp.followers_instagram !== undefined && cp.followers_instagram !== null && Number(cp.followers_instagram) > 0) {
          rawFollowers = Number(cp.followers_instagram);
        } else if (cp.follower_count !== undefined && cp.follower_count !== null && Number(cp.follower_count) > 0) {
          rawFollowers = Number(cp.follower_count);
        } else if (cp.ig_followers !== undefined && cp.ig_followers !== null && Number(cp.ig_followers) > 0) {
          rawFollowers = Number(cp.ig_followers);
        } else if (cp.followers !== undefined && cp.followers !== null && Number(cp.followers) > 0) {
          rawFollowers = Number(cp.followers);
        } else if (cp.instagram_followers !== undefined && cp.instagram_followers !== null && Number(cp.instagram_followers) > 0) {
          rawFollowers = Number(cp.instagram_followers);
        } else if (kyc.follower_count !== undefined && kyc.follower_count !== null && Number(kyc.follower_count) > 0) {
          rawFollowers = Number(kyc.follower_count);
        } else if (cp.total_reach !== undefined && cp.total_reach !== null && Number(cp.total_reach) > 0) {
          rawFollowers = Number(cp.total_reach);
        } else if (cp.followers_youtube !== undefined && cp.followers_youtube !== null && Number(cp.followers_youtube) > 0) {
          rawFollowers = Number(cp.followers_youtube);
        }

        let followersStr = "0";
        if (rawFollowers >= 1000000) {
          followersStr = (rawFollowers / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
        } else if (rawFollowers >= 1000) {
          followersStr = (rawFollowers / 1000).toFixed(1).replace(/\.0$/, '') + "K";
        } else if (rawFollowers > 0) {
          followersStr = rawFollowers.toLocaleString();
        }

        // Clean handle if full URL was provided
        let rawHandle = kyc.instagram_handle || cp.instagram_handle || cp.instagram || cp.handle || a.users?.name?.toLowerCase().replace(/\s+/g, '_') || "creator";
        if (rawHandle.includes("instagram.com/")) {
          rawHandle = rawHandle.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || rawHandle;
        } else if (rawHandle.startsWith("http://") || rawHandle.startsWith("https://")) {
          try {
            const urlObj = new URL(rawHandle);
            rawHandle = urlObj.pathname.replace(/^\/+|\/+$/g, '').split("/")[0] || (a.users?.name || "creator").toLowerCase().replace(/\s+/g, '_');
          } catch(e) {
            rawHandle = (a.users?.name || "creator").toLowerCase().replace(/\s+/g, '_');
          }
        }
        rawHandle = rawHandle.replace(/^@+/, '') || (a.users?.name || "creator").toLowerCase().replace(/\s+/g, '_');
        
        let city = a.creator_location || cp.city || cp.location || kyc.address || "India";
        if (city && city.includes(",")) {
          city = city.split(",")[0].trim();
        }

        const category = (cp.categories && Array.isArray(cp.categories) && cp.categories.length > 0 ? cp.categories.join(", ") : cp.category) ||
          (kyc.niche && Array.isArray(kyc.niche) && kyc.niche.length > 0 ? kyc.niche.join(", ") : (kyc.niche || "Lifestyle"));

        return {
          application_id: a.application_id,
          campaign_id: a.campaign_id,
          creator_id: a.creator_id,
          full_name: a.creator_name || cp.name || kyc.full_name || a.users?.name || "Creator",
          profile_photo_url: a.users?.picture || cp.profile_image_url || cp.photo_url,
          pitch_text: a.pitch,
          proposed_amount: a.proposed_amount,
          creator_location: city,
          status: a.status,
          applied_at: a.created_at,
          followers_count: followersStr,
          raw_followers: rawFollowers,
          instagram_handle: rawHandle,
          category: category,
          city: city,
          kyc_details: kyc
        };
      });
      return res.json(mapped);
    }
    
    // Local DB fallback
    const db = getDb();
    const camp = (db.campaigns || []).find((c: any) => c.campaign_id === req.params.campaign_id);
    if (!camp) return res.json([]);
    const apps = camp.applicants || [];
    const mapped = apps.map((a: any) => {
      const creatorId = a.creator_user_id || a.creator_id;
      const creatorUser = (db.users || []).find((u: any) => u.user_id === creatorId);
      const cp = (db.creator_profiles || []).find((p: any) => p.user_id === creatorId) || {};
      const kyc = ((db as any).creator_kyc || []).find((k: any) => k.creator_id === creatorId) || {};

      let rawFollowers = Number(cp.followers_instagram || cp.follower_count || cp.ig_followers || cp.followers || kyc.follower_count || 0);
      let followersStr = "0";
      if (rawFollowers >= 1000000) followersStr = (rawFollowers / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
      else if (rawFollowers >= 1000) followersStr = (rawFollowers / 1000).toFixed(1).replace(/\.0$/, '') + "K";
      else if (rawFollowers > 0) followersStr = rawFollowers.toLocaleString();

      return {
        application_id: a.application_id,
        campaign_id: req.params.campaign_id,
        creator_id: creatorId,
        full_name: a.creator_name || cp.name || creatorUser?.name || "Creator",
        profile_photo_url: creatorUser?.picture,
        pitch_text: a.pitch || a.cover_letter,
        proposed_amount: a.proposed_amount || a.rate,
        creator_location: cp.city || "India",
        status: a.status || "PENDING",
        applied_at: a.created_at || new Date().toISOString(),
        followers_count: followersStr,
        raw_followers: rawFollowers,
        instagram_handle: cp.instagram_handle || cp.handle || "creator",
        category: cp.category || "Lifestyle",
        city: cp.city || "India"
      };
    });
    return res.json(mapped);
  });


  router.post("/campaigns/:campaign_id/applications/:application_id/action", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { campaign_id, application_id } = req.params;
    const { action } = req.body;

    if (supabase) {
      // 1. Get the application
      const { data: app, error: appErr } = await supabase
        .from('campaign_applications')
        .select('*')
        .eq('application_id', application_id)
        .maybeSingle();

      if (appErr || !app) return res.status(404).json({ error: "Application not found" });

      const newStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';

      // 2. Update application status
      const { error: updErr } = await supabase
        .from('campaign_applications')
        .update({ status: newStatus })
        .eq('application_id', application_id);

      if (updErr) return res.status(500).json({ error: updErr.message });

      if (action === 'accept') {
        // 3. Create or find chat thread
        const { data: existingThread } = await supabase
          .from('chat_threads')
          .select('id')
          .eq('campaign_id', campaign_id)
          .eq('creator_id', app.creator_id)
          .eq('brand_id', user.user_id)
          .maybeSingle();

        let threadId = existingThread?.id;

        if (!threadId) {
          const generatedDealId = crypto.randomUUID();
          threadId = `thread_camp_${generatedDealId}`;
          
          const agreedAmt = app.proposed_amount || 5000;

          // Insert into deals table
          const { error: dealErr } = await (privilegedSupabase || supabase).from('deals').insert({
            id: generatedDealId,
            application_id,
            campaign_id,
            creator_id: app.creator_id,
            brand_id: user.user_id,
            agreed_amount: agreedAmt,
            revision_count: 5,
            revisions_used: 0,
            status: 'NEGOTIATING'
          });

          // Insert into chat_threads
          const { error: threadErr } = await (privilegedSupabase || supabase).from('chat_threads').insert({
            id: threadId,
            campaign_id,
            creator_id: app.creator_id,
            brand_id: user.user_id,
            deal_id: generatedDealId,
            agreed_amount: agreedAmt,
            revision_count: 5,
            status: 'NEGOTIATING',
            flow_state: 'NEGOTIATING'
          });

          if (threadErr) return res.status(500).json({ error: threadErr.message });

          // 4. Send the "negotiation started" welcome message!
          // We pass a proper message_type string 'campaign_approved' instead of user.user_id
          const welcomeMessageText = `Congratulations! You've been selected. Let's negotiate the terms.`;
          const welcomeContent = serializeChatMessage(
            welcomeMessageText,
            'campaign_approved',
            'system',
            null
          );

          await insertChatMessageToSupabase({
            message_id: crypto.randomUUID(),
            thread_id: threadId,
            sender_user_id: user.user_id,
            text: welcomeContent,
            message_type: 'campaign_approved',
            metadata: { action: 'campaign_approved', thread_id: threadId },
            created_at: new Date().toISOString()
          });

          // Also insert a notification
          await (privilegedSupabase || supabase).from('notifications').insert({
            notif_id: crypto.randomUUID(),
            user_id: app.creator_id,
            type: 'chat_unlocked',
            message: `Congratulations! Your campaign application has been approved.`
          });
        }

        return res.json({ ok: true, thread_id: threadId });
      }

      return res.json({ ok: true });
    }

    // Local DB fallback
    const db = getDb();
    const camp = db.campaigns?.find(c => c.campaign_id === campaign_id);
    if (!camp) return res.status(404).json({ detail: "Campaign not found" });

    const applicant = camp.applicants?.find(a => a.application_id === application_id);
    if (!applicant) return res.status(404).json({ detail: "Applicant not found" });

    applicant.status = action === 'accept' ? 'accepted' : 'rejected';

    if (action === 'accept') {
      let thread = db.chat_threads?.find(t => t.campaign_id === campaign_id && t.creator_id === applicant.creator_user_id);
      if (!thread) {
        const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        thread = {
          id: threadId,
          campaign_id,
          creator_id: applicant.creator_user_id,
          brand_id: user.user_id,
          status: 'NEGOTIATING',
          creator_name: applicant.creator_name,
          brand_name: user.name
        };
        if (!db.chat_threads) db.chat_threads = [];
        db.chat_threads.push(thread);

        const welcomeMessageText = `👋 Campaign Application APPROVED!\n\nNegotiations have been unlocked for campaign. Please review the details and confirm terms!`;
        const welcomeContent = serializeChatMessage(
          welcomeMessageText,
          'campaign_approved',
          'system',
          null
        );

        if (!db.chat_messages) db.chat_messages = [];
        db.chat_messages.push({
          id: crypto.randomUUID(),
          thread_id: threadId,
          sender_id: 'system',
          sender_role: 'system',
          message_type: 'campaign_approved',
          content: welcomeMessageText,
          text: welcomeContent,
          created_at: new Date().toISOString()
        });
      }
      saveDb(db);
      return res.json({ ok: true, thread_id: thread.id });
    }

    saveDb(db);
    return res.json({ ok: true });
  });


  router.get("/campaigns/:campaign_id", async (req, res) => {

    if (supabase) {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('campaign_id', req.params.campaign_id)
        .maybeSingle();
      if (error) {
        console.error("Error fetching campaign:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ detail: "Campaign not found" });

      try {
        const { data: bp } = await (privilegedSupabase || supabase).from('brand_profiles').select('company_name, logo').eq('user_id', data.brand_user_id).maybeSingle();
        if (bp) {
          data.brand_name = bp.company_name || data.brand_name || "Brand Name";
          data.brand_logo = bp.logo || data.brand_logo || "";
        }
      } catch (e) {
        console.error("Error enriching campaign brand profile:", e);
      }

      return res.json(data);
    }

    const db = getDb();
    const c = db.campaigns.find((x) => x.campaign_id === req.params.campaign_id);
    if (!c) {
      return res.status(404).json({ detail: "Campaign not found" });
    }
    res.json(c);

  });


  router.post("/campaigns/apply", async (req, res) => {

    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const campaignId = req.body.campaign_id;
    const creatorId = user.user_id;

    // Server-side KYC Gating Check
    const verified = await isCreatorKycVerified(creatorId);
    if (!verified) {
      return res.status(403).json({ 
        error: "Complete KYC verification to apply.", 
        detail: "Complete KYC verification to apply." 
      });
    }

    if (supabase) {
      const { data: existing } = await supabase
        .from('campaign_applications')
        .select('application_id')
        .eq('campaign_id', campaignId)
        .eq('creator_id', creatorId)
        .maybeSingle();

      if (existing) return res.status(400).json({ error: 'Already applied' });

      const payload = { 
        application_id: crypto.randomUUID(), 
        campaign_id: campaignId, 
        creator_id: creatorId, 
        status: 'PENDING',
        pitch: req.body.pitch,
        proposed_amount: Number(req.body.proposed_amount),
        creator_location: req.body.creator_location || null,
        creator_name: req.body.creator_name || null
      };
      
      const { data, error } = await supabase
        .from('campaign_applications')
        .insert(payload);
      
      if (error) {
         return res.status(500).json({ PAYLOAD: payload, ERROR: error });
      }
      
      const { data: camp } = await (privilegedSupabase || supabase).from('campaigns').select('brand_user_id, title').eq('campaign_id', campaignId).maybeSingle();
      if (camp) {
        await (privilegedSupabase || supabase).from('notifications').insert({
          notif_id: crypto.randomUUID(),
          user_id: camp.brand_user_id,
          type: 'new_application',
          message: `${user.name} applied to your campaign "${camp.title}"!`
        });
      }
      return res.json({ ok: true });
    }

    const db = getDb();
    const c = db.campaigns.find((x) => x.campaign_id === campaignId);
    if (!c) return res.status(404).json({ detail: "Campaign not found" });
    if (!c.applicants) c.applicants = [];
    if (c.applicants.find((a) => a.creator_user_id === user.user_id)) return res.status(400).json({ detail: "Already applied" });
    
    c.applicants.push({
      application_id: crypto.randomUUID(),
      creator_user_id: user.user_id,
      creator_name: user.name,
      proposed_amount: req.body.proposedRate || 0,
      pitch: req.body.pitch || "",
      portfolio_links: req.body.portfolioLinks || "",
      est_delivery: req.body.estDelivery || "",
      status: "applied",
      created_at: getIsoNow()
    });
    saveDb(db);
    res.json({ ok: true });

  });

}
