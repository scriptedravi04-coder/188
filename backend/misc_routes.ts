import { logIgnored } from "./logIgnored";
import express from "express";
import crypto from "crypto";
import sharp from "sharp";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { searchLocations } from "./locations";
import { PRIVATE_MEDIA_BUCKETS, isPrivateBucket } from "./mediaAccess";

// Miscellaneous small utility routes that didn't fit a bigger domain:
// public banners, user onboarding/profile-field updates, the public
// leaderboard, a system-status health summary, public creator-apply/
// waitlist signup (thin wrapper), platform fee-config (public read),
// support-style "reports" submission, a creator's own verification
// status, file upload (signed-url + direct multipart), file fetch by id,
// a cost-request quote action, the AI predict-ROI endpoint, and a
// location-search autocomplete.
// The only places the app asks for a signed upload URL (ChatBox, ContentProofNotice, mobile
// chat, UGC order screens). Anything else is refused.
export const SIGNED_UPLOAD_BUCKETS = ["content-submissions"];
export const SIGNED_UPLOAD_FOLDERS = ["ugc-videos/", "campaign-deliverables/", "chat-attachments/"];

export function checkSignedUploadTarget(bucket: any, filePath: any): { ok: boolean; error?: string } {
  const b = String(bucket || "");
  const p = String(filePath || "");
  if (!SIGNED_UPLOAD_BUCKETS.includes(b)) return { ok: false, error: "Uploads to this bucket are not allowed." };
  if (!SIGNED_UPLOAD_FOLDERS.some((f) => p.startsWith(f))) return { ok: false, error: "Uploads to this folder are not allowed." };
  if (p.length > 300 || p.includes("..") || p.includes("//") || p.includes("\\") || !/^[A-Za-z0-9._\/-]+$/.test(p)) {
    return { ok: false, error: "Invalid file path." };
  }
  return { ok: true };
}

export function setupMiscRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    ensureBucketExists,
    getFullFeeAndReferralConfig,
    handlePublicCreatorApply: externalHandlePublicCreatorApply,
    upload,
    getSettings,
    getActingBrandId,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    ensureBucketExists: (bucketName: string, client: any) => Promise<any>;
    getFullFeeAndReferralConfig: () => Promise<any>;
    handlePublicCreatorApply?: (req: express.Request, res: express.Response) => any;
    upload: any;
    getSettings: (db: any) => any;
    getActingBrandId: (user: any) => any;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  const internalHandlePublicCreatorApply = async (req: any, res: any) => {
    try {
      const {
        name,
        city,
        gender,
        social_handle,
        instagram_link,
        followers,
        avg_reach,
        mobile,
        email,
        charges,
        niche,
        collab_types,
        ugc_rating,
        sample_links,
        notes,
        profile_photo_url
      } = req.body;

      if (!name || !social_handle || !email) {
        return res.status(400).json({ error: "Name, handle, and email are required fields" });
      }

      const cleanHandle = String(social_handle || "").trim().replace(/^@+/, '@');
      const cleanEmail = String(email).toLowerCase().trim();
      const cleanMobile = String(mobile || "").trim();
      const cleanName = String(name).trim();

      const parsedCharges = Number(String(charges || '').replace(/[^0-9]/g, '')) || 2500;
      const defaultPhoto = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80";
      const resolvedPhoto = profile_photo_url || defaultPhoto;
      const activeClient = privilegedSupabase || supabase;

      // Check if this email belongs to an already registered user
      let isRegistered = false;
      let existingUserId: string | null = null;
      if (activeClient) {
        try {
          const { data: existingUser } = await activeClient
            .from("users")
            .select("user_id, auth_method, role")
            .ilike("email", cleanEmail)
            .maybeSingle();

          if (existingUser?.user_id && existingUser.auth_method !== 'unclaimed') {
            isRegistered = true;
            existingUserId = existingUser.user_id;
          }
        } catch (e) { logIgnored("misc_routes:114", e); }
      }

      const localDb = getDb();
      if (!isRegistered && localDb.users) {
        const u = localDb.users.find((user: any) => user.email?.toLowerCase().trim() === cleanEmail);
        if (u && u.auth_method !== 'unclaimed') {
          isRegistered = true;
          existingUserId = u.user_id;
        }
      }

      const waitlistId = "WAITLIST_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const payload: any = {
        id: waitlistId,
        name: cleanName,
        city: city || "",
        gender: gender || "",
        social_handle: cleanHandle,
        handle: cleanHandle,
        instagram_link: instagram_link || (cleanHandle ? "https://instagram.com/" + cleanHandle.replace(/^@/, '') : ""),
        followers: Number(followers) || 0,
        follower_count: Number(followers) || 0,
        avg_reach: avg_reach || "",
        mobile: cleanMobile,
        phone: cleanMobile,
        email: cleanEmail,
        charges: charges ? (String(charges).startsWith('₹') ? charges : "₹" + charges) : "₹" + parsedCharges,
        pricing: {
          reel: parsedCharges,
          story: Math.round(parsedCharges * 0.4),
          yt_video: parsedCharges * 2,
          ugc: parsedCharges
        },
        niche: niche || "Fashion & Lifestyle",
        category: niche || "Fashion & Lifestyle",
        collab_types: Array.isArray(collab_types) ? collab_types : [],
        ugc_rating: Number(ugc_rating) || 7,
        sample_links: Array.isArray(sample_links) ? sample_links : [],
        notes: notes || "",
        bio: notes || "",
        profile_photo_url: resolvedPhoto,
        photo: resolvedPhoto,
        role: "creator",
        status: "Pending",
        source: "creator_apply_form",
        is_registered_user: isRegistered,
        linked_user_id: existingUserId,
        created_at: getIsoNow()
      };

      if (activeClient) {
        try {
          const { error: insErr } = await activeClient
            .from("waitlist")
            .insert([payload]);

          if (insErr) {
            console.warn("Waitlist insert error:", insErr.message);
            const payloadNoId = { ...payload };
            delete payloadNoId.id;
            await activeClient.from("waitlist").insert([payloadNoId]);
          }
        } catch (dbErr: any) {
          console.error("Waitlist Supabase insert error:", dbErr.message);
        }
      }

      if (!localDb.waitlist) localDb.waitlist = [];
      const cleanEmailLower = cleanEmail.toLowerCase();
      const cleanMobileNorm = cleanMobile.replace(/\D/g, '');
      const cleanHandleNorm = cleanHandle.toLowerCase().replace(/^@+/, '');
      const cleanNameNorm = cleanName.toLowerCase();

      const exactDuplicateIdx = localDb.waitlist.findIndex((w: any) => {
        const wEmail = (w.email || '').toLowerCase().trim();
        const wMobile = (w.mobile || w.phone || '').replace(/\D/g, '');
        const wHandle = (w.social_handle || w.handle || '').toLowerCase().replace(/^@+/, '');
        const wName = (w.name || '').toLowerCase().trim();
        
        const sameEmail = wEmail && cleanEmailLower && wEmail === cleanEmailLower;
        const sameMobile = wMobile && cleanMobileNorm && wMobile === cleanMobileNorm;
        const sameHandle = wHandle && cleanHandleNorm && wHandle === cleanHandleNorm;
        const sameName = wName && cleanNameNorm && wName === cleanNameNorm;

        return sameName && sameHandle && (sameEmail || sameMobile);
      });

      if (exactDuplicateIdx >= 0) {
        localDb.waitlist[exactDuplicateIdx] = { 
          ...localDb.waitlist[exactDuplicateIdx], 
          ...payload, 
          id: localDb.waitlist[exactDuplicateIdx].id || waitlistId 
        };
      } else {
        localDb.waitlist.unshift(payload);
      }

      // Automatically create or update unclaimed creator profile in creator_profiles
      // so the creator is immediately visible in Explore Creators for Brands to send deals & proposals!
      const creatorProfileUserId = existingUserId || ("creator_lead_" + Math.random().toString(36).substring(2, 10));
      const cleanInstaOnly = cleanHandle.replace(/^@+/, '');
      const creatorProfilePayload: any = {
        user_id: creatorProfileUserId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanMobile,
        instagram: cleanInstaOnly,
        instagram_handle: cleanInstaOnly,
        followers_instagram: Number(followers) || 10000,
        follower_count: Number(followers) || 10000,
        category: niche || "Fashion & Lifestyle",
        primary_niche: niche || "Fashion & Lifestyle",
        niche: niche || "Fashion & Lifestyle",
        city: city || "Mumbai",
        state: "Maharashtra",
        languages: ["Hindi", "English"],
        gender: gender || "Not Specified",
        bio: notes || "",
        rate_card: {
          reel: parsedCharges,
          story: Math.round(parsedCharges * 0.4),
          yt_video: parsedCharges * 2,
          extras: { phone: cleanMobile, profession: "Content Creator", contact_email: cleanEmail }
        },
        barter: "cash_only",
        barter_mode: "cash_only",
        creator_type: "influencer",
        work_mode: "active",
        engagement_rate: 4.8,
        performance_score: 82,
        verified: true,
        is_claimed: isRegistered,
        onboarding_complete: true,
        profile_status: "approved",
        created_at: getIsoNow(),
        updated_at: getIsoNow(),
      };

      if (activeClient) {
        try {
          await activeClient.from('creator_profiles').upsert(creatorProfilePayload);
        } catch (cpErr: any) {
          console.warn("creator_profiles auto-sync warning:", cpErr?.message || cpErr);
        }
      }

      if (!localDb.creator_profiles) localDb.creator_profiles = [];
      const cpIdx = localDb.creator_profiles.findIndex((p: any) => (p.email || '').toLowerCase() === cleanEmail);
      if (cpIdx >= 0) {
        localDb.creator_profiles[cpIdx] = { ...localDb.creator_profiles[cpIdx], ...creatorProfilePayload, user_id: localDb.creator_profiles[cpIdx].user_id || creatorProfileUserId };
      } else {
        localDb.creator_profiles.push(creatorProfilePayload);
      }

      saveDb(localDb);

      return res.json({ ok: true, id: waitlistId, creator_id: creatorProfileUserId, message: "Application submitted successfully" });
    } catch (err: any) {
      console.error("Public creator apply error:", err);
      return res.status(500).json({ error: err.message || "Failed to submit application" });
    }
  };

  const handlePublicCreatorApply = externalHandlePublicCreatorApply || internalHandlePublicCreatorApply;
  app.post("/api/public/creator-apply", handlePublicCreatorApply);
  app.post("/api/public/creators/apply", handlePublicCreatorApply);
  app.post("/api/waitlist", handlePublicCreatorApply);

  router.get("/banners", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    const db = getDb();
    let allBanners = db.banners || [];

    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('banners')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          const mapped = data.map((b: any) => ({
            id: b.id,
            title: b.title || "Featured Promotion",
            description: b.description || "",
            tag: b.tag || "FEATURED",
            link: b.link_url || b.link || "/campaigns",
            imgUrl: b.image_url || b.imgUrl || b.image,
            image: b.image_url || b.imgUrl || b.image,
            status: b.active !== false && b.status !== "Paused" ? "Live" : (b.status || "Draft"),
            type: b.target_dashboard === "all" ? "Common" : (b.target_dashboard === "brand" ? "Brand" : "Influencer"),
            placement: b.placement || "Dashboard Hero Carousel",
            start_date: b.start_date || null,
            end_date: b.end_date || null,
            created_at: b.created_at
          }));
          allBanners = [...mapped, ...allBanners.filter(b => !mapped.some(m => m.id === b.id))];
        }
      } catch (e) {
        console.error("Error fetching Supabase banners in /banners:", e);
      }
    }

    const reqAudience = (req.query.audience as string || req.query.type as string || "").toLowerCase();
    const audienceType = reqAudience
      ? (reqAudience.includes("brand") ? "Brand" : "Influencer")
      : (user?.role === "brand" ? "Brand" : "Influencer");
    const now = new Date();

    const visible = allBanners.filter((b: any) => {
      const isLive = b.status === "Live" || b.status === "active" || b.active === true;
      if (!isLive) return false;
      const bType = (b.type || "").toLowerCase();
      const bTarget = (b.target_dashboard || "").toLowerCase();
      const isCommon = bType === "common" || bType === "both" || bType === "all" || bTarget === "all" || bTarget === "both";
      const isBrandMatch = audienceType === "Brand" && (bType === "brand" || bTarget === "brand");
      const isCreatorMatch = audienceType === "Influencer" && (bType === "influencer" || bType === "creator" || bTarget === "creator" || bTarget === "influencer");
      const isAudienceMatch = isCommon || isBrandMatch || isCreatorMatch;
      if (!isAudienceMatch) return false;
      if (b.start_date && new Date(b.start_date) > now) return false;
      if (b.end_date && new Date(b.end_date) < now) return false;
      return true;
    });

    res.json(visible);
  });


  router.put("/users/onboarding-update", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const tUser = db.users.find(u => u.user_id === user.user_id);
    if (!tUser) return res.status(404).json({ detail: "User not found" });

    const { profile_completed, bank_details_added, kyc_verified, bank_name, bank_account, bank_ifsc } = req.body;

    if (profile_completed !== undefined) {
      tUser.profile_completed = profile_completed;
    }
    if (bank_details_added !== undefined) {
      tUser.bank_details_added = bank_details_added;
      if (bank_name) tUser.bank_name = bank_name;
      if (bank_account) tUser.bank_account = bank_account;
      if (bank_ifsc) tUser.bank_ifsc = bank_ifsc;
    }
    if (kyc_verified !== undefined) {
      tUser.kyc_verified = kyc_verified;
      if (user.role === "creator") {
        let cp = db.creator_profiles?.find(p => p.user_id === user.user_id);
        if (cp) {
          cp.verified = kyc_verified;
        } else {
          if (!db.creator_profiles) db.creator_profiles = [];
          db.creator_profiles.push({
            user_id: user.user_id,
            verified: kyc_verified,
            onboarding_complete: true,
            created_at: getIsoNow(),
            updated_at: getIsoNow()
          });
        }
      } else if (user.role === "brand") {
        let bp = db.brand_profiles?.find(p => p.user_id === user.user_id);
        if (bp) {
          bp.verified = kyc_verified;
        } else {
          if (!db.brand_profiles) db.brand_profiles = [];
          db.brand_profiles.push({
            user_id: user.user_id,
            verified: kyc_verified,
            created_at: getIsoNow(),
            updated_at: getIsoNow()
          });
        }
      }
    }

    saveDb(db);
    res.json({ success: true, user: tUser });
  });


  router.post("/users/profile/update", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const { name, picture } = req.body;
    const db = getDb();
    const tUser = db.users.find(u => u.user_id === user.user_id);

    if (tUser) {
      if (name) tUser.name = name;
      if (picture) tUser.picture = picture;
    }

    if (supabase) {
      try {
        const updateData: any = {};
        if (name) updateData.name = name;
        if (picture !== undefined) updateData.picture = picture;
        await (privilegedSupabase || supabase).from('users').update(updateData).eq('user_id', user.user_id);
      } catch (err) {
        console.error("Error updating user profile in Supabase:", err);
      }
    }

    saveDb(db);
    res.json({ success: true });
  });


  router.get("/leaderboard", async (req, res) => {
    const { category, limit = 25 } = req.query;
    const db = getDb();
    let creators: any[] = [];
    
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('creator_profiles').select('*');
        if (data && data.length > 0) creators = data;
      } catch (e) { logIgnored("misc_routes:436", e); }
    }
    if (!creators.length) {
      creators = db.creator_profiles || [];
    }

    let mapped = creators.map((cp: any) => {
      const u = (db.users || []).find((usr: any) => usr.user_id === cp.user_id);
      return {
        user_id: cp.user_id,
        name: cp.display_name || u?.name || cp.full_name || "Creator",
        photo: cp.photo || cp.profile_pic || u?.picture || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
        category: cp.category || cp.primary_niche || "Lifestyle",
        city: cp.city || "Mumbai",
        engagement_rate: cp.engagement_rate || "4.8%",
        performance_score: cp.performance_score || cp.score || 95
      };
    });

    if (category && typeof category === 'string' && category.trim() !== '') {
      mapped = mapped.filter((c: any) => c.category?.toLowerCase() === category.toLowerCase());
    }

    mapped.sort((a, b) => b.performance_score - a.performance_score);
    res.json(mapped.slice(0, Number(limit)));
  });


  router.get("/system-status", async (req, res) => {
    const db = getDb();
    const settings = getSettings(db);
    
    // Check if auto-off time has passed
    const now = new Date().getTime();
    if (settings.maintenance_mode_creator && settings.maintenance_creator_until) {
       if (now >= new Date(settings.maintenance_creator_until).getTime()) {
          settings.maintenance_mode_creator = false;
          settings.maintenance_creator_until = null;
          saveDb(db);
       }
    }
    if (settings.maintenance_mode_brand && settings.maintenance_brand_until) {
       if (now >= new Date(settings.maintenance_brand_until).getTime()) {
          settings.maintenance_mode_brand = false;
          settings.maintenance_brand_until = null;
          saveDb(db);
       }
    }

    let creatorEnabled = !!settings.maintenance_mode_creator;
    let brandEnabled = !!settings.maintenance_mode_brand;
    let message = settings.maintenance_message || "";
    let enabled_by = settings.maintenance_enabled_by || null;
    let enabled_at = settings.maintenance_enabled_at || null;

    const client = privilegedSupabase || supabase;
    if (client) {
      try {
        const { data, error } = await client
          .from('maintenance_mode')
          .select('*')
          .eq('id', 'singleton')
          .maybeSingle();
          if (!error && data) {
            return res.json(data);
          }
      } catch (err) {
        // ignore and fallback
      }
    }

    res.json({ 
      maintenance_mode_creator: creatorEnabled,
      maintenance_mode_brand: brandEnabled,
      message: message,
      enabled_by: enabled_by,
      enabled_at: enabled_at
    });
  });


  router.get("/platform/fee-config", async (req, res) => {
    const full = await getFullFeeAndReferralConfig();
    res.json(full);
  });


  router.post("/reports", async (req, res) => {
    const user = await parseAuthUser(req);
    const db = getDb();
    const { type, severity, target, description } = req.body;

    const doc = {
      report_id: `rep_${Math.random().toString(36).substring(2, 10)}`,
      type,
      severity: severity || "medium",
      target,
      description: description || "",
      status: "open",
      reported_by: user ? user.user_id : "system",
      reported_by_name: user ? user.name : "System Auto-detect",
      created_at: getIsoNow(),
    };

    if (supabase) {
       try {
         let targetUserId = null;
         if (target && target.length > 5) {
            const { data: maybeUser } = await (privilegedSupabase || supabase).from('users').select('user_id').eq('user_id', target).maybeSingle();
            if (maybeUser) {
              targetUserId = maybeUser.user_id;
            }
         }
         const { error } = await (privilegedSupabase || supabase).from('reports').insert({
           report_id: doc.report_id,
           reporter_user_id: user ? user.user_id : null,
           reporter_name: user ? user.name : "System Auto-detect",
           target_user_id: targetUserId,
           target_name: targetUserId ? null : target,
           type: type,
           description: description || "",
           severity: severity || "medium",
           status: "open"
         });
         if (error) {
           console.error("Supabase reports insert error:", error);
         }
       } catch (e) {
         console.error("Supabase reports insert exception:", e);
       }
    }

    db.reports.push(doc);
    saveDb(db);
    res.json(doc);
  });


  router.get("/verifications/me", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const actingId = user.role === "brand" ? getActingBrandId(user) : user.user_id;

    if (supabase) {
      try {
        // For brands, brand_kyc is the authoritative compliance table
        if (user.role === "brand") {
          const { data: brandKycRow, error: bErr } = await (privilegedSupabase || supabase)
            .from('brand_kyc')
            .select('*')
            .eq('brand_id', actingId)
            .maybeSingle();

          if (bErr) {
            console.error("Error fetching brand_kyc in /verifications/me:", bErr);
          }

          if (brandKycRow) {
            return res.json({
              id: brandKycRow.id || `v_brand_${brandKycRow.brand_id}`,
              user_id: brandKycRow.brand_id,
              status: brandKycRow.status || 'PENDING',
              kind: 'brand',
              type: 'Brand',
              rejection_reason: brandKycRow.rejection_reason || brandKycRow.admin_note || "",
              admin_note: brandKycRow.admin_note || brandKycRow.rejection_reason || "",
              created_at: brandKycRow.submitted_at || brandKycRow.created_at,
              documents: {
                company_name: brandKycRow.company_name,
                gst_cert: brandKycRow.gst_number,
                gstin: brandKycRow.gst_number,
                brand_pan: brandKycRow.pan_number,
                incorporation_proof: brandKycRow.incorporation_doc_url,
                gst_certificate: brandKycRow.gst_certificate_url,
                pan_card: brandKycRow.pan_card_url,
                poc_name: brandKycRow.authorized_person_name,
                poc_designation: brandKycRow.authorized_person_designation,
                poc_email: brandKycRow.work_email,
                poc_phone: brandKycRow.phone,
                website: brandKycRow.website_url,
                social_url: brandKycRow.social_url
              }
            });
          }
        }

        // Retrieve all rows for this user ordered by most recent first
        const { data: vRows, error: vErr } = await supabase
          .from('verifications')
          .select('*')
          .eq('user_id', actingId)
          .order('created_at', { ascending: false });

        if (vErr) {
          console.error("Error fetching from verifications table:", vErr);
        }

        // Fetch creator_kyc if creator, to ensure latest payout credentials take priority
        let creatorKycRow: any = null;
        if (user.role !== "brand") {
          const { data: cKyc } = await (privilegedSupabase || supabase)
            .from('creator_kyc')
            .select('*')
            .eq('creator_id', actingId)
            .maybeSingle();
          creatorKycRow = cKyc;
        }

        const realRow = vRows?.find((r: any) => {
          if (!r) return false;
          if (r.note === "Auto-submitted during onboarding") return false;
          if (!r.documents) return true;
          if (Array.isArray(r.documents)) {
            return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
          }
          if (typeof r.documents === "string") {
            return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
          }
          return true;
        });

        if (realRow || creatorKycRow) {
          const baseDocs = realRow?.documents || {};
          const mergedDocs = {
            ...baseDocs,
            ...(creatorKycRow ? {
              creator_name: creatorKycRow.full_name || baseDocs.creator_name,
              creator_dob: creatorKycRow.dob || baseDocs.creator_dob || '',
              creator_state: creatorKycRow.address || baseDocs.creator_state,
              creator_pan: creatorKycRow.pan_number || baseDocs.creator_pan,
              identity_num: creatorKycRow.pan_number || baseDocs.identity_num,
              creator_aadhaar: creatorKycRow.aadhaar_number || baseDocs.creator_aadhaar || '',
              bank_name: creatorKycRow.bank_name || baseDocs.bank_name || '',
              bank_account: creatorKycRow.bank_account_no || baseDocs.bank_account,
              bank_ifsc: creatorKycRow.bank_ifsc || baseDocs.bank_ifsc,
              bank_holder_name: creatorKycRow.bank_holder_name || baseDocs.bank_holder_name,
              upi_id: creatorKycRow.upi_id || baseDocs.upi_id,
              upi_qr_code_url: creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url,
              social_handle: creatorKycRow.instagram_handle || baseDocs.social_handle,
              followers: creatorKycRow.follower_count || baseDocs.followers,
              uploaded_files: [
                creatorKycRow.pan_card_url || baseDocs.uploaded_files?.[0],
                creatorKycRow.aadhaar_front_url || baseDocs.uploaded_files?.[1],
                creatorKycRow.aadhaar_back_url || baseDocs.uploaded_files?.[2],
                creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3]
              ].filter(Boolean)
            } : {
              upi_qr_code_url: baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3] || ""
            })
          };

          return res.json({
            id: realRow ? realRow.verification_id : `v_creator_${creatorKycRow.creator_id}`,
            user_id: actingId,
            status: creatorKycRow?.status || realRow?.status || 'PENDING',
            kind: realRow?.kind || (user.role === 'brand' ? 'brand' : 'creator'),
            type: realRow?.type || (user.role === 'brand' ? 'Brand' : 'Creator'),
            rejection_reason: creatorKycRow?.rejection_reason || realRow?.rejection_reason || realRow?.admin_note,
            admin_note: creatorKycRow?.admin_note || realRow?.admin_note,
            created_at: creatorKycRow?.submitted_at || realRow?.created_at,
            documents: mergedDocs
          });
        }

        // Fallback to role-specific tables if verifications row does not exist
        if (user.role === "brand") {
          const { data: brandKycRow, error } = await supabase
            .from('brand_kyc')
            .select('*')
            .eq('brand_id', actingId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching brand_kyc:", error);
          }

          if (brandKycRow) {
            return res.json({
              id: `v_brand_${brandKycRow.brand_id}`,
              user_id: brandKycRow.brand_id,
              status: brandKycRow.status || 'PENDING',
              kind: 'brand',
              type: 'Brand',
              rejection_reason: brandKycRow.rejection_reason,
              admin_note: brandKycRow.admin_note,
              created_at: brandKycRow.created_at,
              documents: {
                company_name: brandKycRow.company_name,
                gst_cert: brandKycRow.gst_number,
                gstin: brandKycRow.gst_number,
                brand_pan: brandKycRow.pan_number,
                incorporation_proof: brandKycRow.incorporation_doc_url,
                poc_name: brandKycRow.authorized_person_name,
                poc_designation: brandKycRow.authorized_person_designation,
                poc_email: brandKycRow.work_email,
                poc_phone: brandKycRow.phone,
                website: brandKycRow.website_url,
                social_url: brandKycRow.social_url
              }
            });
          }
        } else {
          const { data: creatorKycRow, error } = await supabase
            .from('creator_kyc')
            .select('*')
            .eq('creator_id', actingId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching creator_kyc:", error);
          }

          if (creatorKycRow) {
            return res.json({
              id: `v_creator_${creatorKycRow.creator_id}`,
              user_id: creatorKycRow.creator_id,
              status: creatorKycRow.status || 'PENDING',
              kind: 'creator',
              type: 'Creator',
              rejection_reason: creatorKycRow.rejection_reason,
              admin_note: creatorKycRow.admin_note,
              created_at: creatorKycRow.created_at,
              documents: {
                creator_name: creatorKycRow.full_name,
                creator_dob: creatorKycRow.dob || '',
                creator_state: creatorKycRow.address,
                creator_pan: creatorKycRow.pan_number,
                identity_num: creatorKycRow.pan_number,
                creator_aadhaar: creatorKycRow.aadhaar_number || '',
                bank_name: creatorKycRow.bank_holder_name || '',
                bank_account: creatorKycRow.bank_account_no,
                bank_ifsc: creatorKycRow.bank_ifsc,
                upi_id: creatorKycRow.upi_id,
                social_handle: creatorKycRow.instagram_handle,
                followers: creatorKycRow.follower_count,
                uploaded_files: [
                  creatorKycRow.pan_card_url,
                  creatorKycRow.aadhaar_front_url,
                  creatorKycRow.aadhaar_back_url
                ]
              }
            });
          }
        }
      } catch (err) {
        console.error("Critical error in /verifications/me:", err);
      }
    }

    // Fallback to local db if no supabase or not found
    const db = getDb();
    if (db) {
      if (user.role === "brand" && db.brand_kyc) {
        const brandKycRow = db.brand_kyc.find((b: any) => b.brand_id === actingId || b.id === actingId);
        if (brandKycRow) {
          return res.json({
            id: brandKycRow.id || `v_brand_${brandKycRow.brand_id}`,
            user_id: brandKycRow.brand_id,
            status: brandKycRow.status || 'PENDING',
            kind: 'brand',
            type: 'Brand',
            rejection_reason: brandKycRow.rejection_reason || brandKycRow.admin_note || "",
            admin_note: brandKycRow.admin_note || brandKycRow.rejection_reason || "",
            created_at: brandKycRow.submitted_at || brandKycRow.created_at,
            documents: {
              company_name: brandKycRow.company_name,
              gst_cert: brandKycRow.gst_number,
              gstin: brandKycRow.gst_number,
              brand_pan: brandKycRow.pan_number,
              incorporation_proof: brandKycRow.incorporation_doc_url,
              gst_certificate: brandKycRow.gst_certificate_url,
              pan_card: brandKycRow.pan_card_url,
              poc_name: brandKycRow.authorized_person_name,
              poc_designation: brandKycRow.authorized_person_designation,
              poc_email: brandKycRow.work_email,
              poc_phone: brandKycRow.phone,
              website: brandKycRow.website_url,
              social_url: brandKycRow.social_url
            }
          });
        }
      }

      if (db.verifications) {
        // Find latest verification for this user
        const vRows = db.verifications.filter(v => v.user_id === actingId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      let creatorKycRow = null;
      // @ts-ignore
      if (user.role !== "brand" && db.creator_kyc) {
         // @ts-ignore
         creatorKycRow = db.creator_kyc.find(c => c.creator_id === actingId);
      }

      const realRow = vRows.find((r) => {
        if (!r) return false;
        if (r.note === "Auto-submitted during onboarding") return false;
        if (!r.documents) return true;
        if (Array.isArray(r.documents)) {
          return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
        }
        if (typeof r.documents === "string") {
          return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
        }
        return true;
      });

      if (realRow || creatorKycRow) {
        const baseDocs = realRow?.documents || {};
        const mergedDocs = {
          ...baseDocs,
          ...(creatorKycRow ? {
            creator_name: creatorKycRow.full_name || baseDocs.creator_name,
            creator_dob: creatorKycRow.dob || baseDocs.creator_dob || '',
            creator_state: creatorKycRow.address || baseDocs.creator_state,
            creator_pan: creatorKycRow.pan_number || baseDocs.creator_pan,
            identity_num: creatorKycRow.pan_number || baseDocs.identity_num,
            creator_aadhaar: creatorKycRow.aadhaar_number || baseDocs.creator_aadhaar || '',
            bank_name: creatorKycRow.bank_name || baseDocs.bank_name || '',
            bank_account: creatorKycRow.bank_account_no || baseDocs.bank_account,
            bank_ifsc: creatorKycRow.bank_ifsc || baseDocs.bank_ifsc,
            bank_holder_name: creatorKycRow.bank_holder_name || baseDocs.bank_holder_name,
            upi_id: creatorKycRow.upi_id || baseDocs.upi_id,
            upi_qr_code_url: creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url,
            social_handle: creatorKycRow.instagram_handle || baseDocs.social_handle,
            followers: creatorKycRow.follower_count || baseDocs.followers,
            uploaded_files: [
              creatorKycRow.pan_card_url || baseDocs.uploaded_files?.[0],
              creatorKycRow.aadhaar_front_url || baseDocs.uploaded_files?.[1],
              creatorKycRow.aadhaar_back_url || baseDocs.uploaded_files?.[2],
              creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3]
            ].filter(Boolean)
          } : {
            upi_qr_code_url: baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3] || ""
          })
        };

        return res.json({
          status: realRow ? realRow.status : "pending",
          admin_note: realRow?.note || "",
          rejection_reason: realRow?.note || "",
          documents: mergedDocs
        });
      }
    }
  }

    // Default fallback is NOT_SUBMITTED when no record is found in live DB
    return res.json({
      status: "NOT_SUBMITTED",
      documents: {}
    });
  });


  router.post("/upload/signed-url", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const { bucket, path: filePath } = req.body || {};
    if (!bucket || !filePath) return res.status(400).json({ error: "bucket and path are required" });
    // This signs with the service-role key, which ignores storage policies. It used to sign an
    // upload to ANY bucket and ANY path the caller named (brand logos, KYC documents, other
    // users' files). Only the deliverable/attachment folders the app actually uploads to.
    const uploadCheck = checkSignedUploadTarget(bucket, filePath);
    if (!uploadCheck.ok) return res.status(400).json({ error: uploadCheck.error, code: "UPLOAD_TARGET_NOT_ALLOWED" });

    try {
      const activeSupabase = privilegedSupabase || supabase;
      if (!activeSupabase) throw new Error("Supabase is not configured on the server.");

      const { data, error } = await activeSupabase.storage
        .from(bucket)
        .createSignedUploadUrl(filePath, { upsert: false }); // never overwrite an existing file

      if (error) {
        throw new Error(error.message);
      }
      
      // content-submissions is private: the only way to open the file is the access-checked proxy.
      res.json({
        signedUrl: data.signedUrl,
        token: data.token,
        path: data.path,
        publicUrl: `/api/media?src=${encodeURIComponent(`${bucket}/${filePath}`)}`
      });
    } catch (e: any) {
      console.error("[Storage] createSignedUploadUrl error:", e);
      res.status(500).json({ error: e.message || "Failed to generate signed upload URL" });
    }
  });


  router.post("/upload", upload.single("file"), async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    let content_type = "";
    let original_filename = "";
    let size = 0;
    let buffer: Buffer | null = null;

    if (req.file) {
      content_type = req.file.mimetype;
      buffer = req.file.buffer;
      original_filename = req.file.originalname;
      size = req.file.size;
    } else if (req.body && req.body.base64Data) {
      const matches = req.body.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        content_type = matches[1];
        const data_base64 = matches[2];
        buffer = Buffer.from(data_base64, 'base64');
        original_filename = req.body.filename || `upload-${Date.now()}`;
        size = buffer.length;
      } else {
        return res.status(400).json({ detail: "Invalid base64 data" });
      }
    } else {
      return res.status(400).json({ detail: "No file uploaded" });
    }

    const file_id = `file_${Math.random().toString(36).substring(2, 15)}`;
    let ext = "bin";
    if (original_filename.includes('.')) {
      ext = path.extname(original_filename).toLowerCase().replace(".", "");
    } else if (content_type) {
      ext = content_type.split('/')[1] || "bin";
    }

    // Attempt Supabase Storage Upload
    const targetBucket = (req.query.bucket as string) || (req.body && req.body.bucket as string) || "cover-images";

    if (!supabase || !buffer) {
      return res.status(500).json({ error: "Storage service configuration is missing or no file buffer." });
    }

    // --- PART 1: KYC Document Compression ---
    if (targetBucket === "kyc-documents" && buffer) {
      if (content_type.startsWith("image/")) {
        try {
          console.log(`[KYC Storage] Compressing image upload (original size: ${buffer.length} bytes)`);
          buffer = await sharp(buffer)
            .resize({ width: 15000, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          size = buffer.length;
          content_type = "image/jpeg";
          ext = "jpg";
          console.log(`[KYC Storage] Compression successful (new size: ${size} bytes)`);
        } catch (compressErr: any) {
          console.error(`[KYC Storage] Image compression failed: ${compressErr.message}`);
        }
      } else if (content_type === "application/pdf") {
        console.log(`[KYC Storage] Uploading PDF document (original size: ${buffer.length} bytes). Skipping compression due to complex embedded image extraction constraints.`);
      }
    }
    // -----------------------------------------


    const filePath = `${user.user_id}/${file_id}.${ext}`;
    const activeSupabase = privilegedSupabase || supabase;

    let uploadSuccess = false;
    let finalPublicUrl = null;
    let uploadErrorMsg = "Unknown error";
    
    try {
      // Ensure the bucket exists (creating it as a public bucket if it's missing)
      await ensureBucketExists(targetBucket, activeSupabase);
    } catch (e: any) {
      return res.status(500).json({ error: `Could not configure storage bucket: ${e.message}` });
    }

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES && !uploadSuccess) {
      attempt++;
      try {
        console.log(`[Storage] Attempting upload of ${file_id} to '${targetBucket}' (Attempt ${attempt}/${MAX_RETRIES}) using ${privilegedSupabase ? 'service_role' : 'anon'} key...`);
        
        const { error: uploadErr } = await activeSupabase.storage
          .from(targetBucket)
          .upload(filePath, buffer, {
            contentType: content_type,
            upsert: true
          });

        if (uploadErr) {
          uploadErrorMsg = uploadErr.message;
          throw new Error(uploadErr.message); // throw to catch and retry
        }

        // Generate URL
        const privateBuckets = ['kyc-documents', 'content-submissions', 'live-proofs', 'ugc-assets'];
        if (PRIVATE_MEDIA_BUCKETS.includes(targetBucket)) {
          // Deliverables: a link that goes through the access check, never a 7-day storage URL.
          finalPublicUrl = `/api/media?src=${encodeURIComponent(`${targetBucket}/${filePath}`)}`;
        } else if (privateBuckets.includes(targetBucket)) {
          const { data: signedData, error: signErr } = await activeSupabase.storage
            .from(targetBucket)
            .createSignedUrl(filePath, 60 * 60 * 24 * 7);
          if (signErr || !signedData || !signedData.signedUrl) {
            uploadErrorMsg = signErr?.message || "Failed to generate signed URL";
            throw new Error(uploadErrorMsg);
          }
          finalPublicUrl = signedData.signedUrl;
        } else {
          const { data: urlData } = activeSupabase.storage
            .from(targetBucket)
            .getPublicUrl(filePath);
          if (!urlData || !urlData.publicUrl) {
            uploadErrorMsg = "Failed to generate public URL";
            throw new Error(uploadErrorMsg);
          }
          finalPublicUrl = urlData.publicUrl;
        }
        
        // Track in public.files table consistently
        const { error: dbErr } = await (privilegedSupabase || supabase).from('files').insert({
          file_id: file_id,
          user_id: user.user_id,
          storage_path: `${targetBucket}/${filePath}`,
          original_filename: original_filename,
          content_type: content_type,
          size: size
        });

        if (dbErr) {
          uploadErrorMsg = dbErr.message;
          throw new Error(uploadErrorMsg);
        }

        uploadSuccess = true;
      } catch (err: any) {
        console.warn(`[Storage] Upload attempt ${attempt} failed:`, err.message);
        if (attempt < MAX_RETRIES) {
          const backoffMs = Math.pow(2, attempt) * 500; // 1s, 2s
          await new Promise(r => setTimeout(r, backoffMs));
        } else {
          uploadErrorMsg = err.message || uploadErrorMsg;
        }
      }
    }

    if (!uploadSuccess) {
      console.error(`[Storage] All ${MAX_RETRIES} attempts failed for ${file_id}. Last error: ${uploadErrorMsg}`);
      return res.status(500).json({ error: `File upload failed after ${MAX_RETRIES} attempts: ${uploadErrorMsg}` });
    }

    console.log(`[Storage] Tracked upload in files table successfully (bucket: ${targetBucket})!`);
    return res.json({
      file_id,
      url: `/api/files/${file_id}`,
      path: filePath,
      public_url: finalPublicUrl
    });
  });


  router.get("/files/:file_id", async (req, res) => {
    if (!supabase) {
      return res.status(500).json({ error: "Storage service not configured" });
    }
    
    try {
      const { data: fileRecord, error: fileErr } = await supabase
        .from('files')
        .select('*')
        .eq('file_id', req.params.file_id)
        .maybeSingle();

      if (fileErr) {
        console.error("Error querying file record:", fileErr);
        return res.status(500).json({ error: "Database error querying file" });
      }

      if (fileRecord && !fileRecord.is_deleted) {
        const storagePath = fileRecord.storage_path;
        
        if (storagePath) {
          const slashIdx = storagePath.indexOf('/');
          if (slashIdx !== -1) {
            const bucketName = storagePath.substring(0, slashIdx);
            const remainingPath = storagePath.substring(slashIdx + 1);

            // Session 22: this served ANY file by id with no login — KYC documents included.
            // Private buckets: the owner or staff only (deal partners use /api/media).
            if (isPrivateBucket(bucketName)) {
              const viewer = await parseAuthUser(req);
              const staff = viewer && (["admin", "sub_admin"].includes(String(viewer.role)) || viewer.team_role === "sub_admin");
              const mine = viewer ? [viewer.user_id, viewer.parent_brand_id].filter(Boolean).map(String) : [];
              if (!viewer) return res.status(401).json({ error: "Please log in to view this file." });
              if (!staff && !mine.includes(String(fileRecord.user_id))) return res.status(403).json({ error: "You don't have access to this file." });
            }

            const { data, error } = await supabase.storage
              .from(bucketName)
              .download(remainingPath);

            if (!error && data) {
              const arrayBuffer = await data.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const contentType = fileRecord.content_type || 'image/jpeg';
              res.setHeader('Content-Type', contentType);
              res.setHeader('Content-Length', buffer.length.toString());
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              return res.send(buffer);
            }
            console.error(`[Storage] Error downloading '${remainingPath}' from bucket '${bucketName}':`, error);
            return res.status(404).json({ error: `Could not download file: ${error?.message || "Not found"}` });
          }
        }
      }
      
      return res.status(404).json({ detail: "File not found or deleted" });
    } catch (err: any) {
      console.error("Error fetching file from Supabase files table/storage:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });


  router.post("/cost-requests/:id/quote", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (user.role !== "creator") return res.status(403).json({ detail: "Only creators can quote" });

    const db = getDb();
    db.collab_cost_requests = db.collab_cost_requests || [];
    const request = db.collab_cost_requests.find((r) => r.id === req.params.id);
    if (!request) return res.status(404).json({ detail: "Cost request not found" });

    const { quoted_amount } = req.body;
    request.quoted_amount = quoted_amount;
    request.status = "QUOTED";
    request.responded_at = getIsoNow();

    db.notifications = db.notifications || [];
    db.notifications.push({
      notif_id: `notif_${Math.random().toString(36).substring(2, 10)}`,
      user_id: request.brand_id,
      type: "collab_cost_quoted",
      message: `Creator quoted ₹${quoted_amount} for your cost request`,
      read: false,
      created_at: getIsoNow(),
    });

    saveDb(db);
    res.json(request);
  });


  router.post("/ai/predict-roi", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const { campaign, creators } = req.body || {};
    const creatorList = Array.isArray(creators) ? creators : [];

    const fallbackEstimate = () => {
      const avgFollowers = creatorList.length
        ? creatorList.reduce((sum: number, c: any) => sum + (Number(c.followers_count || c.followers || c.instagram_followers) || 5000), 0) / creatorList.length
        : 5000;
      const estimatedReach = Math.round(avgFollowers * Math.max(creatorList.length, 1) * 0.35);
      const estimatedEngagement = Math.round(estimatedReach * 0.06);
      const roiMultiplier = Number((1.5 + Math.min(creatorList.length, 10) * 0.15).toFixed(1));
      return {
        estimatedReach,
        estimatedEngagement,
        roiMultiplier,
        analysis: `Based on ${creatorList.length} creator(s), this campaign is projected to reach a meaningful audience with solid engagement. This is an approximate estimate.`
      };
    };

    if (!process.env.GEMINI_API_KEY || creatorList.length === 0) {
      return res.json(fallbackEstimate());
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const promptString = `You are a marketing analytics expert. Given this campaign and shortlist of creator applicants, estimate the campaign's potential performance.

Campaign: ${JSON.stringify(campaign || {}).slice(0, 2000)}
Creators (${creatorList.length}): ${JSON.stringify(creatorList).slice(0, 3000)}

Respond with ONLY a raw JSON object (no markdown, no code fences) in exactly this shape:
{"estimatedReach": <integer>, "estimatedEngagement": <integer>, "roiMultiplier": <number, one decimal place>, "analysis": "<one short sentence>"}`;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI prediction timeout")), 4000)
      );

      const aiCallPromise = ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: promptString,
      });

      const response: any = await Promise.race([aiCallPromise, timeoutPromise]);

      const text = (response.text || "").trim().replace(/^```json\s*|```$/g, "");
      const parsed = JSON.parse(text);

      if (
        typeof parsed.estimatedReach === "number" &&
        typeof parsed.estimatedEngagement === "number" &&
        typeof parsed.roiMultiplier === "number"
      ) {
        return res.json(parsed);
      }
      return res.json(fallbackEstimate());
    } catch (err) {
      console.warn("[/ai/predict-roi] AI call failed, using fallback estimate:", err);
      return res.json(fallbackEstimate());
    }
  });


  router.get("/locations/search", (req, res) => {
    const q = (req.query.q || "") as string;
    const limit = parseInt((req.query.limit || "15") as string);
    const results = searchLocations(q, limit);
    return res.json(results);
  });

  router.post("/public/creator-apply", handlePublicCreatorApply);
  router.post("/waitlist", handlePublicCreatorApply);
}
