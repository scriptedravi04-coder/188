import { logIgnored } from "./logIgnored";
import express from "express";
import crypto from "crypto";

export interface PublicCreatorRoutesDeps {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  parseAuthUser?: (req: express.Request) => Promise<any>;
}

export function setupPublicCreatorRoutes(
  app: express.Application,
  router: express.Router,
  { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser }: PublicCreatorRoutesDeps
) {
  const dbClient = privilegedSupabase || supabase;

  /**
   * POST /api/public/creators/apply
   * 
   * Public endpoint for HTML landing page form submissions.
   * Creates an unclaimed creator profile so the creator immediately appears
   * in "Explore Creators" for brands to discover and send proposals to.
   * 
   * When the creator later signs up on /signup with their email,
   * Smart Signup Auto-Merge seamlessly links this profile and all deals.
   */
  router.post("/public/creators/apply", async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        instagram,
        followers,
        category,
        categories,
        city,
        state,
        charge_per_post,
        bio,
        gender,
      } = req.body || {};

      if (!name || !email) {
        return res.status(400).json({ error: "Name and email are required" });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanName = String(name).trim();
      const cleanPhone = phone ? String(phone).trim() : "";
      
      // Clean instagram handle: handle @username, instagram.com/username, or username
      let cleanInsta = (instagram || "").trim();
      cleanInsta = cleanInsta.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
      cleanInsta = cleanInsta.replace(/^@/, "").trim();

      const followersCount = parseInt(followers, 10) || 10000;
      const rateVal = parseInt(charge_per_post, 10) || 5000;
      const primaryCategory = category || (Array.isArray(categories) && categories[0]) || "Lifestyle";
      const nowIso = new Date().toISOString();

      const db = getDb();

      // Check if an existing profile exists with this email
      let existingProfile = (db.creator_profiles || []).find((p: any) => (p.email || '').toLowerCase() === cleanEmail);
      if (!existingProfile && dbClient) {
        try {
          const { data } = await dbClient.from('creator_profiles').select('*').ilike('email', cleanEmail).maybeSingle();
          if (data) existingProfile = data;
        } catch (e) { logIgnored("public_creator_routes:72", e); }
      }

      const userId = existingProfile?.user_id || crypto.randomUUID();

      const profilePayload: any = {
        user_id: userId,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone || existingProfile?.phone || "",
        instagram: cleanInsta || existingProfile?.instagram || "",
        instagram_handle: cleanInsta || existingProfile?.instagram || "",
        followers_instagram: followersCount || existingProfile?.followers_instagram || 10000,
        follower_count: followersCount || existingProfile?.follower_count || 10000,
        category: primaryCategory,
        primary_niche: primaryCategory,
        niche: primaryCategory,
        categories: Array.isArray(categories) && categories.length > 0 ? categories : [primaryCategory],
        city: city || existingProfile?.city || "Mumbai",
        state: state || existingProfile?.state || "Maharashtra",
        languages: ["Hindi", "English"],
        gender: gender || "Not Specified",
        bio: bio || existingProfile?.bio || "",
        rate_card: {
          reel: rateVal,
          story: Math.round(rateVal * 0.4),
          yt_video: Math.round(rateVal * 1.5),
          extras: {
            phone: cleanPhone,
            profession: "Content Creator",
            contact_email: cleanEmail
          }
        },
        barter: "cash_only",
        barter_mode: "cash_only",
        creator_type: "influencer",
        work_mode: "active",
        engagement_rate: 4.8,
        performance_score: 82,
        verified: true, // Visible in Explore Creators
        is_claimed: false, // Will become true upon user signup
        onboarding_complete: true,
        profile_status: "approved",
        created_at: existingProfile?.created_at || nowIso,
        updated_at: nowIso,
      };

      // Save to Supabase creator_profiles
      if (dbClient) {
        try {
          await dbClient.from('creator_profiles').upsert(profilePayload);
        } catch (err: any) {
          console.warn("[PublicCreatorApply] Supabase upsert error:", err?.message || err);
        }

        // Also record in waitlist table for pipeline tracking
        try {
          await dbClient.from('waitlist').upsert({
            email: cleanEmail,
            name: cleanName,
            phone: cleanPhone,
            instagram: cleanInsta,
            followers: followersCount,
            category: primaryCategory,
            city: city || "Mumbai",
            charge_per_post: rateVal,
            status: "landing_lead",
            source: "html_landing_page",
            created_at: nowIso,
          });
        } catch (wErr: any) {
          console.warn("[PublicCreatorApply] Waitlist upsert error:", wErr?.message || wErr);
        }
      }

      // Save to local memory DB
      if (!db.creator_profiles) db.creator_profiles = [];
      const pIdx = db.creator_profiles.findIndex((p: any) => p.user_id === userId || (p.email && p.email.toLowerCase() === cleanEmail));
      if (pIdx >= 0) {
        db.creator_profiles[pIdx] = { ...db.creator_profiles[pIdx], ...profilePayload };
      } else {
        db.creator_profiles.push(profilePayload);
      }

      if (!db.waitlist) db.waitlist = [];
      const wIdx = db.waitlist.findIndex((w: any) => (w.email || '').toLowerCase() === cleanEmail);
      const wRecord = {
        id: crypto.randomUUID(),
        email: cleanEmail,
        name: cleanName,
        phone: cleanPhone,
        instagram: cleanInsta,
        followers: followersCount,
        category: primaryCategory,
        city: city || "Mumbai",
        charge_per_post: rateVal,
        status: "landing_lead",
        created_at: nowIso,
      };
      if (wIdx >= 0) {
        db.waitlist[wIdx] = { ...db.waitlist[wIdx], ...wRecord };
      } else {
        db.waitlist.push(wRecord);
      }

      saveDb(db);

      console.log(`[PublicCreatorApply] Successfully registered lead: ${cleanName} (${cleanEmail}, @${cleanInsta})`);

      return res.status(200).json({
        success: true,
        message: "Application submitted successfully! Your profile is now listed for brand collaborations.",
        creator_id: userId,
        claimed: false
      });
    } catch (err: any) {
      console.error("[PublicCreatorApply] Error:", err?.message || err);
      return res.status(500).json({ error: "Failed to submit creator application" });
    }
  });

  /**
   * POST /api/public/creators/bulk-import
   * 
   * Allows importing the 63-67 existing leads into creator_profiles and waitlist.
   */
  router.post("/public/creators/bulk-import", async (req, res) => {
    // Session 22: had NO login check — anyone could mass-insert creator leads. Admins only.
    const actor = parseAuthUser ? await parseAuthUser(req) : null;
    if (!actor || !(["admin", "sub_admin"].includes(String(actor.role)) || actor.team_role === "sub_admin")) {
      return res.status(403).json({ error: "Admin privileges required." });
    }
    try {
      const { leads } = req.body || {};
      if (!Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: "Leads array is required" });
      }

      const db = getDb();
      const imported: any[] = [];
      const nowIso = new Date().toISOString();

      for (const lead of leads) {
        const cleanEmail = String(lead.email || "").trim().toLowerCase();
        const cleanName = String(lead.name || "Creator").trim();
        if (!cleanEmail) continue;

        let cleanInsta = String(lead.instagram || lead.instagram_handle || lead.insta || "").trim();
        cleanInsta = cleanInsta.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "").replace(/^@/, "");

        const followersCount = parseInt(lead.followers || lead.followers_instagram || 10000, 10) || 10000;
        const rateVal = parseInt(lead.charge_per_post || lead.rate || 5000, 10) || 5000;
        const primaryCat = lead.category || lead.niche || "Lifestyle";
        const cleanCity = lead.city || "Mumbai";
        const cleanPhone = lead.phone ? String(lead.phone).trim() : "";

        let existing = (db.creator_profiles || []).find((p: any) => (p.email || "").toLowerCase() === cleanEmail);
        const userId = existing?.user_id || crypto.randomUUID();

        const profile = {
          user_id: userId,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone || existing?.phone || "",
          instagram: cleanInsta,
          instagram_handle: cleanInsta,
          followers_instagram: followersCount,
          follower_count: followersCount,
          category: primaryCat,
          primary_niche: primaryCat,
          city: cleanCity,
          state: lead.state || "Maharashtra",
          languages: lead.languages || ["Hindi", "English"],
          gender: lead.gender || "Not Specified",
          bio: lead.bio || "",
          rate_card: {
            reel: rateVal,
            story: Math.round(rateVal * 0.4),
            yt_video: Math.round(rateVal * 1.5),
            extras: { phone: cleanPhone, profession: "Content Creator", contact_email: cleanEmail }
          },
          barter: "cash_only",
          barter_mode: "cash_only",
          creator_type: "influencer",
          work_mode: "active",
          engagement_rate: 4.8,
          performance_score: 82,
          verified: true,
          is_claimed: false,
          onboarding_complete: true,
          profile_status: "approved",
          created_at: nowIso,
          updated_at: nowIso,
        };

        if (dbClient) {
          try {
            await dbClient.from('creator_profiles').upsert(profile);
            await dbClient.from('waitlist').upsert({
              email: cleanEmail,
              name: cleanName,
              phone: cleanPhone,
              instagram: cleanInsta,
              followers: followersCount,
              category: primaryCat,
              city: cleanCity,
              charge_per_post: rateVal,
              status: "lead_imported",
              source: "bulk_import",
              created_at: nowIso,
            });
          } catch (e: any) {
            console.warn("[BulkImport] Supabase upsert error:", e?.message || e);
          }
        }

        if (!db.creator_profiles) db.creator_profiles = [];
        const idx = db.creator_profiles.findIndex((p: any) => p.user_id === userId || (p.email && p.email.toLowerCase() === cleanEmail));
        if (idx >= 0) db.creator_profiles[idx] = profile;
        else db.creator_profiles.push(profile);

        imported.push({ email: cleanEmail, name: cleanName, user_id: userId });
      }

      saveDb(db);

      return res.status(200).json({
        success: true,
        message: `Successfully imported ${imported.length} creator leads!`,
        count: imported.length,
        imported
      });
    } catch (err: any) {
      console.error("[BulkImport] Error:", err?.message || err);
      return res.status(500).json({ error: "Failed to bulk import leads" });
    }
  });
}
