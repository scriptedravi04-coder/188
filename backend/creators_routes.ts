import express from "express";
import crypto from "crypto";
import { transformRateCard } from "./helpers";

// Public creator-facing and creator-discovery routes: creator profile
// creation, public creator listing/search, viewing a single creator's
// public profile, reviews, saving/bookmarking creators, requesting a
// collab-cost estimate, sending a brief directly, "my own profile"
// shortcuts, agency-side creator listing, and toggling work-mode
// (available/unavailable for collabs).
//
// Three thin wrappers (handleCreatorKycSubmit, handleGetCreatorProfile,
// handleGetCreatorsMe) still have their actual logic in server.ts — only
// the route registration is here, with the real handler function passed
// in as a dependency, exactly like the earlier UGC thin-wrapper split.
export function setupCreatorsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    syncEntityTags,
    processBase64Image,
    getSettings,
    markupForRole,
    getActingBrandId,
    logTeamActivity,
    handleCreatorKycSubmit,
    handleGetCreatorProfile,
    handleGetCreatorsMe,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    syncEntityTags: (entityType: string, entityId: string, tags: any[]) => Promise<any>;
    processBase64Image: (imgUrl: string, bucket: string, user_id: string) => Promise<any>;
    getSettings: (db: any) => any;
    markupForRole: (role: string | null | undefined, settings: any) => number;
    getActingBrandId: (user: any) => any;
    logTeamActivity: (db: any, user: any, action: string, detail: string) => void;
    handleCreatorKycSubmit: (req: express.Request, res: express.Response) => any;
    handleGetCreatorProfile: (req: express.Request, res: express.Response) => any;
    handleGetCreatorsMe: (req: express.Request, res: express.Response) => any;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  router.post("/creator/kyc/submit", handleCreatorKycSubmit);
  router.post("/verifications/creator", handleCreatorKycSubmit);

  router.post("/creators/profile", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const body = req.body;

    if (body.email && body.email !== user.email) {
      if (supabase) {
        const { data: existingUser } = await (privilegedSupabase || supabase)
          .from('users')
          .select('user_id')
          .eq('email', body.email)
          .maybeSingle();
        if (existingUser && existingUser.user_id !== user.user_id) {
          return res.status(400).json({ detail: "Email address is already in use by another account." });
        }
      } else {
         const db = getDb();
         const existingUser = db.users.find((u) => u.email && u.email.toLowerCase() === body.email.toLowerCase() && u.user_id !== user.user_id);
         if (existingUser) {
           return res.status(400).json({ detail: "Email address is already in use by another account." });
         }
      }
    }

    // Fetch existing profile to prevent overwriting with blank values if partial save occurs
    let existingProfile: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('creator_profiles')
          .select('*')
          .eq('user_id', user.user_id)
          .maybeSingle();
        if (data) existingProfile = data;
      } catch (e) {
        console.warn("Could not load existing creator profile for merge:", e);
      }
    } else {
      const db = getDb();
      const localProfile = db.creator_profiles?.find(c => c.user_id === user.user_id);
      if (localProfile) existingProfile = localProfile;
    }

    const followers = Number(
      body.ig_followers !== undefined ? body.ig_followers :
      (body.instagram_followers !== undefined ? body.instagram_followers : 
      (body.followers_instagram !== undefined ? body.followers_instagram : 
      (body.follower_count !== undefined ? body.follower_count : 
      (existingProfile?.ig_followers || existingProfile?.instagram_followers || existingProfile?.followers_instagram || existingProfile?.follower_count || 0))))
    );
    const subs = Number(body.youtube_subscribers !== undefined ? body.youtube_subscribers : (body.followers_youtube !== undefined ? body.followers_youtube : (body.yt_subscribers !== undefined ? body.yt_subscribers : (existingProfile?.followers_youtube || 0))));
    const totalFollowers = followers + subs;

    const igReach = Number(
      body.avg_views_30d !== undefined ? body.avg_views_30d :
      (body.instagram_avg_reach !== undefined ? body.instagram_avg_reach : 
      (body.average_reach !== undefined ? body.average_reach : 
      (body.reach !== undefined ? body.reach : 
      (existingProfile?.avg_views_30d || existingProfile?.instagram_avg_reach || existingProfile?.average_reach || 0))))
    );

    const igLikes = Number(
      body.avg_likes_30d !== undefined ? body.avg_likes_30d :
      (body.instagram_avg_likes !== undefined ? body.instagram_avg_likes :
      (existingProfile?.avg_likes_30d || 0))
    );

    const igComments = Number(
      body.avg_comments_30d !== undefined ? body.avg_comments_30d :
      (body.instagram_avg_comments !== undefined ? body.instagram_avg_comments :
      (existingProfile?.avg_comments_30d || 0))
    );

    const ytViews = Number(body.youtube_avg_views !== undefined ? body.youtube_avg_views : (body.yt_avg_views !== undefined ? body.yt_avg_views : (existingProfile?.youtube_avg_views || 0)));
    const totalReach = igReach + ytViews;

    // Server-side Engagement Rate calculation: ((avg_likes_30d + avg_comments_30d) / ig_followers) * 100
    let er: number | null = null;
    if (followers > 0) {
      if (igLikes > 0 || igComments > 0) {
        er = parseFloat((((igLikes + igComments) / followers) * 100).toFixed(2));
      } else if (igReach > 0) {
        er = parseFloat(((igReach / followers) * 100).toFixed(2));
      } else {
        er = 0;
      }
      if (er > 100) er = 100;
    } else if (subs > 0 && ytViews > 0) {
      er = parseFloat(((ytViews / subs) * 100).toFixed(2));
      if (er > 100) er = 100;
    } else if (existingProfile?.engagement_rate !== undefined && existingProfile?.engagement_rate !== null) {
      er = Number(existingProfile.engagement_rate);
    } else {
      er = 0;
    }

    // Dynamic fake follower % (Authentic audience = 100 - fake_follower_pct)
    let fake = parseFloat((3.5 + (totalFollowers % 120) / 10).toFixed(1)); // 3.5% to 15.5% fake
    if (er !== null && er < 3) {
      fake = parseFloat((8.5 + (totalFollowers % 150) / 10).toFixed(1));
    }
    if (existingProfile?.fake_follower_pct !== undefined && body.follower_count === undefined && body.instagram_followers === undefined) {
      fake = Number(existingProfile.fake_follower_pct);
    }

    // Dynamic Avg Views (30d) - set directly to instagram_avg_reach or total reach
    const avg_views = igReach > 0 ? igReach : (totalReach > 0 ? totalReach : (existingProfile?.avg_views_30d || Math.max(0, Math.round(totalFollowers * 0.12))));

    // Dynamic Performance Score
    let perf = Math.round(75 + ((er || 4) * 1.5) - (fake * 0.4));
    perf = Math.max(60, Math.min(98, perf));
    if (existingProfile?.performance_score !== undefined && body.follower_count === undefined && body.instagram_followers === undefined) {
      perf = Number(existingProfile.performance_score);
    }
    const stats_last_updated_at = body.stats_last_updated_at || getIsoNow();

    const rate_reel_val = Number(body.reel_rate !== undefined ? body.reel_rate : (body.rate_reel !== undefined ? body.rate_reel : (existingProfile?.rate_reel || (existingProfile?.rate_card && (existingProfile.rate_card.reels || existingProfile.rate_card.reel)) || 0)));
    const rate_story_val = Number(body.story_rate !== undefined ? body.story_rate : (body.rate_story !== undefined ? body.rate_story : (existingProfile?.rate_story || (existingProfile?.rate_card && (existingProfile.rate_card.stories || existingProfile.rate_card.story)) || 0)));
    const rate_yt_video_val = Number(body.youtube_video_rate !== undefined ? body.youtube_video_rate : (body.rate_yt_video !== undefined ? body.rate_yt_video : (existingProfile?.rate_yt_video || (existingProfile?.rate_card && existingProfile.rate_card.yt_video) || 0)));

    let rateCardData: any = {};
    if (existingProfile?.rate_card && typeof existingProfile.rate_card === 'object') {
      rateCardData = { ...existingProfile.rate_card };
    } else {
      rateCardData = { reels: rate_reel_val, stories: rate_story_val, yt_video: rate_yt_video_val, reel: rate_reel_val, story: rate_story_val };
    }
    if (body.rate_card && typeof body.rate_card === 'object') {
      // Deep merge nested other_platforms and extras if they exist
      const existingOtherPlats = rateCardData.other_platforms || {};
      const newOtherPlats = body.rate_card.other_platforms || {};
      const existingExtras = rateCardData.extras || {};
      const newExtras = body.rate_card.extras || {};

      rateCardData = { 
        ...rateCardData, 
        ...body.rate_card,
        other_platforms: { ...existingOtherPlats, ...newOtherPlats },
        extras: { ...existingExtras, ...newExtras }
      };
    }

    // Also handle top-level other_platforms from onboarding
    if (body.other_platforms && typeof body.other_platforms === 'object') {
      const existingOtherPlats = rateCardData.other_platforms || {};
      rateCardData.other_platforms = { ...existingOtherPlats, ...body.other_platforms };
    }

    // Ensure all variants of keys are populated/synchronized for safety
    rateCardData.reels = Number(rateCardData.reels !== undefined ? rateCardData.reels : (rateCardData.reel !== undefined ? rateCardData.reel : rate_reel_val));
    rateCardData.stories = Number(rateCardData.stories !== undefined ? rateCardData.stories : (rateCardData.story !== undefined ? rateCardData.story : rate_story_val));
    rateCardData.yt_video = Number(rateCardData.yt_video !== undefined ? rateCardData.yt_video : rate_yt_video_val);
    rateCardData.cover_image = body.cover_image || existingProfile?.cover_image || rateCardData.cover_image || "";

    let rawPicture = body.photo || body.profile_photo_url || existingProfile?.photo || existingProfile?.picture || user.picture || "";
    let rawCover = body.cover_image || existingProfile?.cover_image || "";
    rawPicture = await processBase64Image(rawPicture, "profile-assets", user.user_id);
    rawCover = await processBase64Image(rawCover, "cover-images", user.user_id);

    const ensureString = (val: any): string => {
      if (Array.isArray(val)) return val.join(", ");
      return typeof val === 'string' ? val : "";
    };

    let finalCategory = ensureString(body.category !== undefined ? body.category : (body.primary_niche !== undefined ? body.primary_niche : (existingProfile?.category || existingProfile?.primary_niche || "")));
    if (finalCategory === "Go to Settings & select category first") {
      finalCategory = "";
    }

    const instagram_val = body.instagram !== undefined ? body.instagram : (body.instagram_handle !== undefined ? body.instagram_handle : (existingProfile?.instagram || existingProfile?.instagram_handle || ""));
    const youtube_val = body.youtube !== undefined ? body.youtube : (body.youtube_channel_url !== undefined ? body.youtube_channel_url : (existingProfile?.youtube || existingProfile?.youtube_channel_url || ""));
    const barter_val = body.barter !== undefined ? body.barter : (body.barter_mode !== undefined ? body.barter_mode : (existingProfile?.barter || existingProfile?.barter_mode || "cash_only"));
    const payment_terms_val = body.payment_terms !== undefined ? body.payment_terms : (existingProfile?.payment_terms || "within_30_days");

    const profileData = {
      user_id: user.user_id,
      name: body.name || body.full_name || existingProfile?.name || user.name,
      email: body.email || existingProfile?.email || user.email,
      picture: rawPicture,
      photo: rawPicture,
      bio: body.bio !== undefined ? body.bio : (existingProfile?.bio || ""),
      category: finalCategory,
      sub_categories: body.sub_categories !== undefined ? body.sub_categories : (existingProfile?.sub_categories || []),
      city: body.city !== undefined ? body.city : (existingProfile?.city || ""),
      state: body.state !== undefined ? body.state : (existingProfile?.state || ""),
      languages: body.languages !== undefined ? body.languages : (existingProfile?.languages || []),
      gender: body.gender !== undefined ? body.gender : (existingProfile?.gender || ""),
      instagram: instagram_val,
      youtube: youtube_val,
      twitter: body.twitter !== undefined ? body.twitter : (body.other_platforms?.twitter || body.other_platforms?.x || rateCardData.other_platforms?.twitter || rateCardData.other_platforms?.x || existingProfile?.twitter || ""),
      linkedin: body.linkedin !== undefined ? body.linkedin : (body.other_platforms?.linkedin || rateCardData.other_platforms?.linkedin || existingProfile?.linkedin || ""),
      followers_instagram: followers,
      followers_youtube: subs,
      rate_card: rateCardData,
      cover_image: rawCover,
      barter: barter_val,
      payment_terms: payment_terms_val,
      portfolio: body.portfolio !== undefined ? body.portfolio : (existingProfile?.portfolio || []),
      past_brands: body.past_brands !== undefined ? body.past_brands : (existingProfile?.past_brands || []),
      creator_type: body.creator_type !== undefined ? body.creator_type : (existingProfile?.creator_type || "influencer"),
      work_mode: body.work_mode !== undefined ? body.work_mode : (existingProfile?.work_mode || "active"),
      onboarding_complete: body.onboarding_complete !== undefined ? body.onboarding_complete : (existingProfile?.onboarding_complete !== undefined ? existingProfile.onboarding_complete : true),
      profile_status: body.profile_status || existingProfile?.profile_status || "under_review",
      engagement_rate: er,
      fake_follower_pct: fake,
      avg_views_30d: avg_views,
      avg_likes_30d: igLikes,
      avg_comments_30d: igComments,
      performance_score: perf,
      profile_views: existingProfile?.profile_views || 0,
      instagram_handle: instagram_val,
      follower_count: followers,
      ig_followers: followers,
      instagram_followers: followers,
      average_reach: igReach,
      instagram_avg_reach: igReach,
      stats_last_updated_at: stats_last_updated_at,
      primary_niche: finalCategory,
      barter_mode: barter_val,
      rate_reel: rate_reel_val,
      rate_story: rate_story_val,
      rate_yt_video: rate_yt_video_val,
      updated_at: getIsoNow(),
    };

    try {
       // Update or Insert into creator_profiles
       let profileError = null;
       if (supabase) {
         try {
           const supabaseCreatorData: any = {
             user_id: profileData.user_id,
             name: profileData.name,
             email: profileData.email,
             picture: profileData.picture,
             photo: profileData.photo,
             bio: profileData.bio,
             category: profileData.category,
             sub_categories: profileData.sub_categories,
             city: profileData.city,
             state: profileData.state,
             languages: profileData.languages,
             gender: profileData.gender,
             instagram: profileData.instagram,
             youtube: profileData.youtube,
             twitter: profileData.twitter,
             linkedin: profileData.linkedin,
             followers_instagram: profileData.followers_instagram,
             followers_youtube: profileData.followers_youtube,
             rate_card: profileData.rate_card,
             barter: profileData.barter,
             payment_terms: profileData.payment_terms,
             portfolio: profileData.portfolio,
             past_brands: profileData.past_brands,
             creator_type: profileData.creator_type,
             work_mode: profileData.work_mode,
             engagement_rate: profileData.engagement_rate,
             fake_follower_pct: profileData.fake_follower_pct,
             avg_views_30d: profileData.avg_views_30d,
             avg_likes_30d: profileData.avg_likes_30d,
             avg_comments_30d: profileData.avg_comments_30d,
             performance_score: profileData.performance_score,
             profile_views: profileData.profile_views,
             instagram_handle: instagram_val,
             follower_count: followers,
             ig_followers: followers,
             primary_niche: finalCategory,
             barter_mode: barter_val,
             rate_reel: rate_reel_val,
             rate_story: rate_story_val,
             rate_yt_video: rate_yt_video_val,
             updated_at: profileData.updated_at
           };

           const { data: existing } = await (privilegedSupabase || supabase).from('creator_profiles').select('user_id').eq('user_id', user.user_id).maybeSingle();
           if (existing) {
             const { error } = await (privilegedSupabase || supabase).from('creator_profiles').update(supabaseCreatorData).eq('user_id', user.user_id);
             profileError = error;
           } else {
             const { error } = await (privilegedSupabase || supabase).from('creator_profiles').insert(supabaseCreatorData);
             profileError = error;
           }
         } catch (catchErr: any) {
           console.error("Supabase creator_profiles save exception:", catchErr);
           profileError = catchErr;
         }
       }
       if (profileError) {
         console.error("Error upserting creator profile in Supabase:", profileError.message || profileError);
         return res.status(500).json({ error: "Supabase creator profile save failed: " + (profileError.message || String(profileError)) });
       }

       // Update users table
       const isComplete = Boolean(body.onboarding_complete || body.onboarding_completed || user.onboarded);
       if (supabase) {
         const extractedPhone = body.phone !== undefined ? body.phone : body.contact_info?.phone;
         const userUpdatePayload: any = { 
             picture: profileData.picture,
             name: profileData.name,
             email: profileData.email,
         };
         if (isComplete) {
           userUpdatePayload.onboarded = true;
         }
         if (extractedPhone !== undefined) {
             userUpdatePayload.phone = extractedPhone;
         }

         const { error: userError } = await (privilegedSupabase || supabase)
           .from('users')
           .update(userUpdatePayload)
           .eq('user_id', user.user_id);
         if (userError) {
           console.error("Error updating user onboard status:", JSON.stringify(userError));
         }
       }
       
       // Fallback for local dev
       const db = getDb();
       if (!db.creator_profiles) db.creator_profiles = [];
       const idx = db.creator_profiles.findIndex(c => c.user_id === user.user_id);
       if (idx > -1) {
         db.creator_profiles[idx] = { ...db.creator_profiles[idx], ...profileData };
       } else {
         db.creator_profiles.push(profileData);
       }
       const usr = db.users?.find((u: any) => u.user_id === user.user_id);
       if (usr) {
         usr.picture = profileData.picture;
         usr.photo = profileData.picture;
         usr.avatar = profileData.picture;
         usr.name = profileData.name;
         usr.email = profileData.email;
         if (isComplete) {
           usr.onboarded = true;
         }
       }
       saveDb(db);

       // Universal Category & Niche Search Sync
       (async () => {
         try {
           const tagsToSync = [];
           if (profileData.category) tagsToSync.push({ name: profileData.category, type: 'niche' as const });
           if (Array.isArray(profileData.sub_categories)) {
             profileData.sub_categories.forEach((sc: string) => {
               if (sc) tagsToSync.push({ name: sc, type: 'skill' as const });
             });
           }
           if (Array.isArray(req.body.niches)) {
             req.body.niches.forEach((n: string) => {
               if (n) tagsToSync.push({ name: n, type: 'niche' as const });
             });
           }
           if (Array.isArray(req.body.skills)) {
             req.body.skills.forEach((s: string) => {
               if (s) tagsToSync.push({ name: s, type: 'skill' as const });
             });
           }
           if (Array.isArray(profileData.languages)) {
             profileData.languages.forEach((lang: string) => {
               if (lang) tagsToSync.push({ name: lang, type: 'language' as const });
             });
           }
           const prof = req.body.rate_card?.extras?.profession || req.body.profession;
           if (prof) {
             tagsToSync.push({ name: prof, type: 'profession' as const });
           }
           const uniqueTags = Array.from(
             new Map(tagsToSync.map(item => [item.name.toLowerCase() + '-' + item.type, item])).values()
           );
           if (uniqueTags.length > 0) {
             await syncEntityTags('creator_profile', user.user_id, uniqueTags);
           }
         } catch (e) {
           console.error("Error in creator profile tag sync:", e);
         }
       })();

       // Handle verifications insert if not exists
       if (supabase) {
         const { data: pendingVer } = await supabase
         .from('verifications')
         .select('verification_id')
         .eq('user_id', user.user_id)
         .eq('status', 'pending')
         .maybeSingle();

       if (!pendingVer) {
         await (privilegedSupabase || supabase).from('verifications').insert({
           verification_id: `ver_${Math.random().toString(36).substring(2, 10)}`,
           user_id: user.user_id,
           name: profileData.name,
           email: profileData.email,
           photo: profileData.picture || "",
           kind: "creator",
           category: profileData.category || "Unknown",
           handle: profileData.instagram || profileData.youtube || `@${profileData.name.split(" ")[0].toLowerCase()}`,
           followers: (profileData.followers_instagram || 0) + (profileData.followers_youtube || 0) || 115000,
           documents: ["Onboarding Profile"],
           note: "Auto-submitted during onboarding",
           status: "pending",
           created_at: getIsoNow(),
         });
       }
       }
       res.json({ ok: true });
    } catch(err) {
       console.error(err);
       res.status(500).json({ detail: "Server error" });
    }
  });


  router.get("/creators", async (req, res) => {
    const db = getDb();
    const viewer = await parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    let list = db.creator_profiles || [];
    
    // Only show verified profiles unless creator is viewing themselves or requested by an admin
    list = list.filter((c) => {
      // Exclude soft-deleted profiles unless viewing self
      if (c.is_deleted && viewer?.user_id !== c.user_id) return false;
      
      if (c.verified) return true;
      if (viewer?.role === "admin") return true;
      if (viewer?.user_id === c.user_id) return true;
      return false;
    });

    const {
      q,
      category,
      city,
      platform,
      min_followers,
      max_followers,
      max_budget,
      min_engagement,
      language,
      gender,
      barter,
      creator_type,
      sort_by,
    } = req.query;

    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes((q as string).toLowerCase()));
    }
    if (category) {
      list = list.filter((c) => c.category === category);
    }
    if (city) {
      list = list.filter((c) => c.city === city);
    }
    if (language) {
      list = list.filter((c) => c.languages && c.languages.includes(language));
    }
    if (gender) {
      list = list.filter((c) => c.gender === gender);
    }
    if (barter) {
      list = list.filter((c) => c.barter === barter);
    }
    if (creator_type) {
      list = list.filter((c) => c.creator_type === creator_type);
    }
    if (min_engagement) {
      list = list.filter((c) => c.engagement_rate >= parseFloat(min_engagement as string));
    }

    const settings = getSettings(db);
    const pct = markupForRole(viewer?.role, settings);

    const totalFollowers = (c: any) => (c.followers_instagram || 0) + (c.followers_youtube || 0);
    const minRate = (c: any) => {
      const rc = c.rate_card || {};
      const values = Object.values(rc).filter((v) => typeof v === "number") as number[];
      return values.length > 0 ? Math.min(...values) : 0;
    };

    let processed = list.map((c) => {
      const mapped = { ...c };
      if (pct) {
        mapped.rate_card = transformRateCard(c.rate_card, pct);
      }
      mapped.total_followers = totalFollowers(mapped);
      mapped.min_rate = minRate(mapped);
      return mapped;
    });

    if (min_followers) {
      processed = processed.filter((c) => c.total_followers >= parseInt(min_followers as string, 10));
    }
    if (max_followers) {
      processed = processed.filter((c) => c.total_followers <= parseInt(max_followers as string, 10));
    }
    if (max_budget) {
      processed = processed.filter((c) => c.min_rate <= parseInt(max_budget as string, 10));
    }
    if (platform === "instagram") {
      processed = processed.filter((c) => c.instagram);
    }
    if (platform === "youtube") {
      processed = processed.filter((c) => c.youtube);
    }

    if (sort_by === "followers") {
      processed.sort((a, b) => b.total_followers - a.total_followers);
    } else if (sort_by === "engagement") {
      processed.sort((a, b) => b.engagement_rate - a.engagement_rate);
    } else if (sort_by === "budget") {
      processed.sort((a, b) => a.min_rate - b.min_rate);
    } else {
      processed.sort((a, b) => b.performance_score - a.performance_score);
    }

    res.json(processed.slice(0, 100));
  });


  router.post("/creators/:id/review", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) return res.status(401).json({ detail: "Please log in to submit a review.", _status: 401 });
      const { rating, comment } = req.body;
      if (!rating || Number(rating) < 1 || Number(rating) > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5." });
      }
      if (!comment || !String(comment).trim()) {
        return res.status(400).json({ error: "Comment is required." });
      }

      const creatorId = req.params.id;
      const db = getDb();
      if (!db.creator_reviews) db.creator_reviews = [];

      const reviewObj = {
        id: "rev_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        creator_id: creatorId,
        creator_user_id: creatorId,
        brand_id: user.user_id,
        brand_name: user.name || "Brand Partner",
        brand_avatar: user.picture || "",
        rating: Number(rating),
        comment: String(comment).trim(),
        created_at: getIsoNow()
      };

      db.creator_reviews.push(reviewObj);
      saveDb(db);

      res.json({ success: true, review: reviewObj });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to submit review" });
    }
  });


  router.post("/creators/:id/save", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (user.role !== "brand") return res.status(403).json({ detail: "Only brands can save creators" });

    const db = getDb();
    db.saved_creators = db.saved_creators || [];
    const brand_id = getActingBrandId(user);
    const creator_id = req.params.id;

    const idx = db.saved_creators.findIndex((s) => s.brand_id === brand_id && s.creator_id === creator_id);
    let saved = false;
    if (idx > -1) {
      db.saved_creators.splice(idx, 1);
    } else {
      db.saved_creators.push({ brand_id, creator_id, created_at: getIsoNow() });
      saved = true;
    }
    saveDb(db);
    res.json({ saved });
  });


  router.get("/creators/:id/saved-status", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.json({ saved: false });
    const db = getDb();
    db.saved_creators = db.saved_creators || [];
    const brand_id = getActingBrandId(user);
    const creator_id = req.params.id;
    const isSaved = db.saved_creators.some((s) => s.brand_id === brand_id && s.creator_id === creator_id);
    res.json({ saved: isSaved });
  });


  router.post("/creators/:id/request-collab-cost", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (user.role !== "brand") return res.status(403).json({ detail: "Only brands can request cost" });

    const db = getDb();
    db.collab_cost_requests = db.collab_cost_requests || [];
    const brand_id = getActingBrandId(user);
    const creator_id = req.params.id;
    const { deliverable_type, brand_message } = req.body;

    const newRequest = {
      id: `cost_req_${Math.random().toString(36).substring(2, 10)}`,
      brand_id,
      creator_id,
      deliverable_type,
      brand_message,
      status: "PENDING",
      created_at: getIsoNow(),
    };

    db.collab_cost_requests.push(newRequest);

    db.notifications = db.notifications || [];
    db.notifications.push({
      notif_id: `notif_${Math.random().toString(36).substring(2, 10)}`,
      user_id: creator_id,
      type: "collab_cost",
      message: `A brand requested collab cost for ${deliverable_type}`,
      read: false,
      created_at: getIsoNow(),
    });

    saveDb(db);
    res.json(newRequest);
  });


  router.post("/creators/:id/send-brief", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (user.role !== "brand") return res.status(403).json({ detail: "Only brands can send briefs" });

    const db = getDb();
    db.brief_requests = db.brief_requests || [];
    const brand_id = getActingBrandId(user);
    const creator_id = req.params.id;
    const { message, budget_range } = req.body;

    const newBrief = {
      id: `brief_req_${Math.random().toString(36).substring(2, 10)}`,
      brand_id,
      creator_id,
      message,
      budget_range,
      status: "PENDING",
      created_at: getIsoNow(),
    };

    db.brief_requests.push(newBrief);

    db.notifications = db.notifications || [];
    db.notifications.push({
      notif_id: `notif_${Math.random().toString(36).substring(2, 10)}`,
      user_id: creator_id,
      type: "new_brief",
      message: `You received a new brief request!`,
      read: false,
      created_at: getIsoNow(),
    });

    saveDb(db);
    res.json(newBrief);
  });


  router.get("/agency/creators", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const actingId = getActingBrandId(user);
    const list = db.creator_profiles.filter((c) => c.managed_by_agency_id === actingId);
    res.json(list);
  });


  router.post("/agency/creators", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const userTeamRole = user.team_role || "admin";
    if (userTeamRole === "viewer") {
      return res.status(403).json({ detail: "Viewer role is read-only and cannot add creators to portfolio." });
    }

    const db = getDb();
    const actingId = getActingBrandId(user);
    const body = req.body;

    const cid = `creator_managed_${Math.random().toString(36).substring(2, 11)}`;
    const newProfile = {
      user_id: cid,
      name: body.name || "Managed Talent",
      email: body.email || `managed.${cid}@agency.demo`,
      picture: body.photo || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400",
      photo: body.photo || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400",
      bio: body.bio || "Professional creator managed under our talent agency portfolio.",
      category: body.category || "Lifestyle",
      sub_categories: [body.category || "Lifestyle"],
      city: body.city || "",
      state: body.state || "",
      languages: body.languages || ["Hindi", "English"],
      gender: body.gender || "female",
      instagram: body.instagram || `@${(body.name || "talent").replace(/\s+/g, "").toLowerCase()}`,
      youtube: body.youtube || `${body.name || "Talent"} Youtube Channel`,
      followers_instagram: parseInt(body.followers_instagram) || 45000,
      followers_youtube: parseInt(body.followers_youtube) || 12000,
      rate_card: body.rate_card || { reel: 8000, story: 15000, yt_video: 15000 },
      barter: body.barter || "barter_ok",
      payment_terms: "within_30_days",
      portfolio: [body.photo || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400"],
      past_brands: ["Flipkart", "Nykaa"],
      work_mode: "active",
      engagement_rate: 4.8,
      fake_follower_pct: 0.9,
      avg_views_30d: 15000,
      performance_score: 92,
      managed_by_agency_id: actingId,
      created_at: getIsoNow(),
    };

    db.creator_profiles.push(newProfile);
    
    // If they aren't registered as a full user yet, let's also register a placeholder user profile for routing safety
    db.users.push({
      user_id: cid,
      email: newProfile.email,
      name: newProfile.name,
      role: "creator",
      picture: newProfile.photo,
      onboarded: true,
      verified: true,
      created_at: getIsoNow()
    });

    logTeamActivity(db, user, "Add Portfolio Creator", `Published managed portfolio for creator '${newProfile.name}'`);
    saveDb(db);

    res.json(newProfile);
  });


  router.post("/creators/work-mode", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "creator") {
      return res.status(403).json({ detail: "Only creator profiles can toggle their availability status" });
    }

    const { work_mode } = req.body;
    if (!["active", "away"].includes(work_mode)) {
      return res.status(400).json({ detail: "Invalid work_mode structure. Must be 'active' or 'away'" });
    }

    const db = getDb();
    const cp = db.creator_profiles.find((p) => p.user_id === user.user_id);
    if (cp) {
      cp.work_mode = work_mode;
    }
    
    const usr = db.users.find((u) => u.user_id === user.user_id);
    if (usr) {
      usr.work_mode = work_mode;
    }

    saveDb(db);
    res.json({ ok: true, work_mode });
  });

  router.get("/creators/:user_id/profile", handleGetCreatorProfile);
  router.get("/creators/:user_id", handleGetCreatorProfile);
  router.get("/creators/me", handleGetCreatorsMe);
  router.get("/creator/me", handleGetCreatorsMe);
  router.get("/creator/profile", handleGetCreatorsMe);
}
