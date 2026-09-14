import express from "express";
import crypto from "crypto";

// Brand-facing routes: public single-brand fetch, public brand-profile
// view, brand profile creation, team listing, and adding a team member.
// Plus 5 thin wrappers (brand KYC submit, and the various "my own brand
// profile" shortcut paths) whose real logic still lives in server.ts.
export function setupBrandsRoutes(
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
    getActingBrandId,
    logTeamActivity,
    handleBrandKycSubmit,
    handleGetBrandsMe,
    sanitizeBrandProfile,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    syncEntityTags: (entityType: string, entityId: string, tags: any[]) => Promise<any>;
    processBase64Image: (imgUrl: string, bucket: string, user_id: string) => Promise<any>;
    getActingBrandId: (user: any) => any;
    logTeamActivity: (db: any, user: any, action: string, detail: string) => void;
    handleBrandKycSubmit: (req: express.Request, res: express.Response) => any;
    handleGetBrandsMe: (req: express.Request, res: express.Response) => any;
    sanitizeBrandProfile: (bp: any) => any;
  }
) {
  const getIsoNow = () => new Date().toISOString();
  router.get("/brand/top-performers", (req, res) => res.json([]));

  router.get("/brands/:id", async (req, res) => {
    let { id } = req.params;
    if (id === "me") {
      const user = await parseAuthUser(req);
      if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
      id = getActingBrandId(user);
    }
    const db = getDb();
    if (supabase) {
      try {
        let { data } = await (privilegedSupabase || supabase)
          .from('brand_profiles')
          .select('*')
          .eq('user_id', id)
          .maybeSingle();
        if (!data) {
          const res = await (privilegedSupabase || supabase)
            .from('brand_profiles')
            .select('*')
            .ilike('company_name', id)
            .maybeSingle();
          if (res?.data) data = res.data;
        }
        if (data) {
          const sanitized = sanitizeBrandProfile(data);
          return res.json(sanitized);
        }
      } catch(e) {}
    }
    const local = (db.brand_profiles || []).find((bp: any) => bp.user_id === id || bp.id === id || (bp.company_name && bp.company_name.toLowerCase() === id.toLowerCase()));
    if (local) {
      return res.json(sanitizeBrandProfile(local));
    }
    res.status(404).json({ error: "Brand profile not found" });
  });


  router.get("/brand-profile", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const actingId = getActingBrandId(user);


    const db = getDb();
    let bp = null;
    if (supabase) {
      const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', actingId).maybeSingle();
      bp = data;
    }
    if (!bp) bp = db.brand_profiles?.find((p: any) => p.user_id === actingId);
    if (bp) {
      return res.json(sanitizeBrandProfile(bp));
    }
    return res.json({ team_role: user.team_role || "admin", company_name: user.name || "Brand" });
  });


  router.post("/brands/profile", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const body = req.body;
    const userTeamRole = user.team_role || "admin";
    if (userTeamRole !== "admin") {
      return res.status(403).json({ detail: "Only brand administrator (Admin) can modify company details." });
    }

    const actingId = getActingBrandId(user);

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

    const cover_image = body.cover_image || "";
    
    let rawLogo = body.logo || user.picture || "";
    if (rawLogo && rawLogo.startsWith("data:image/")) {
      rawLogo = await processBase64Image(rawLogo, "brand-logos", actingId);
    }

    const profileData = {
      user_id: actingId,
      company_name: body.company_name || user.name,
      industry: body.industry || "",
      team_size: body.team_size || "",
      website: body.website || "",
      description: body.description || "",
      logo: rawLogo,
      cover_image: cover_image,
      representative_name: body.representative_name,
      representative_designation: body.representative_designation,
      representative_mobile: body.representative_mobile,
      campaign_types: body.campaign_types,
      budget_range: body.budget_range,
      preferred_creator_size: body.preferred_creator_size,
      preferred_niches: body.preferred_niches,
      gender_focus: body.gender_focus,
      agency_mode: body.agency_mode || false,
      email: body.email || "",
      updated_at: getIsoNow(),
    };

    try {
      let profileError = null;
      if (supabase) {
        const supabaseBrandData = { ...profileData };
        delete supabaseBrandData.agency_mode;
        // cover_image is now a real column in Supabase, we do not delete it!
        const { data: existing } = await (privilegedSupabase || supabase).from('brand_profiles').select('user_id').eq('user_id', actingId).maybeSingle();
        if (existing) {
          const { error } = await (privilegedSupabase || supabase).from('brand_profiles').update(supabaseBrandData).eq('user_id', actingId);
          profileError = error;
        } else {
          const { error } = await (privilegedSupabase || supabase).from('brand_profiles').insert(supabaseBrandData);
          profileError = error;
        }
      }
      if (profileError) {
        console.error("Error upserting brand profile in Supabase:", profileError.message || profileError);
        return res.status(500).json({ error: "Supabase brand profile save failed: " + (profileError.message || String(profileError)) });
      }

      // Update user document
      const isComplete = Boolean(body.onboarding_complete || body.onboarding_completed || user.onboarded);
      const updatePayload: any = {
        name: profileData.company_name,
        picture: profileData.logo,
      };
      if (isComplete) {
        updatePayload.onboarded = true;
      }
      
      if (body.representative_mobile !== undefined) {
        updatePayload.phone = body.representative_mobile;
      }
      if (body.email !== undefined) {
        updatePayload.email = body.email;
      }
      
      if (body.role === "talent_manager") {
         updatePayload.role = "talent_manager";
      }

      if (supabase) {
        console.log(`[BRAND PROFILE UPDATE] Syncing user data. actingId: ${actingId}, user.user_id: ${user.user_id}, logo: ${profileData.logo}`);
        
        const { error: userError } = await (privilegedSupabase || supabase)
          .from('users')
          .update(updatePayload)
          .eq('user_id', user.user_id);
          
        if (userError) {
          console.error("Error updating user onboard status in Supabase:", JSON.stringify(userError));
        }

        if (actingId) {
          const { error: actingUserError } = await (privilegedSupabase || supabase)
            .from('users')
            .update({ name: profileData.company_name, picture: profileData.logo })
            .eq('user_id', actingId);
          if (actingUserError) {
            console.error(`[BRAND PROFILE UPDATE] Error syncing to actingId ${actingId} user record:`, actingUserError);
          } else {
            console.log(`[BRAND PROFILE UPDATE] Successfully synchronized actingId ${actingId} user record`);
          }
        }

        // Cascade/Denormalize to all campaigns table rows for this brand
        const { error: campaignUpdateErr } = await (privilegedSupabase || supabase)
          .from('campaigns')
          .update({
            brand_name: profileData.company_name,
            brand_logo: profileData.logo
          })
          .eq('brand_user_id', actingId);
        if (campaignUpdateErr) {
          console.error("Error updating campaigns with new brand details:", campaignUpdateErr);
        }
      }

      if (supabase) {
         const { data: pendingVer } = await supabase
        .from('verifications')
        .select('verification_id')
        .eq('user_id', actingId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!pendingVer) {
        await (privilegedSupabase || supabase).from('verifications').insert({
          verification_id: `ver_${Math.random().toString(36).substring(2, 10)}`,
          user_id: actingId,
          name: profileData.company_name,
          email: user.email,
          photo: profileData.logo || "",
          kind: "brand",
          category: profileData.industry || "D2C Brand",
          handle: profileData.website || "https://ybexmedia.com",
          followers: 0,
          documents: ["Corporate Registration"],
          note: "Auto-submitted during onboarding",
          status: "pending",
          created_at: getIsoNow(),
        });
      }
      }

      const db = getDb();
      if (!db.brand_profiles) db.brand_profiles = [];
      const bIdx = db.brand_profiles.findIndex((p: any) => p.user_id === actingId);
      if (bIdx > -1) db.brand_profiles[bIdx] = { ...db.brand_profiles[bIdx], ...profileData };
      else db.brand_profiles.push(profileData);

      const usr = db.users?.find((u: any) => u.user_id === user.user_id);
      if (usr) {
        usr.picture = profileData.logo;
        usr.photo = profileData.logo;
        usr.avatar = profileData.logo;
        usr.name = profileData.company_name;
        usr.onboarded = true;
        if (body.email !== undefined) usr.email = body.email;
        if (body.representative_mobile !== undefined) usr.phone = body.representative_mobile;
      }
      saveDb(db);
      // Universal Category & Niche Search Sync
      (async () => {
        try {
          const tagsToSync = [];
          if (profileData.industry) {
            tagsToSync.push({ name: profileData.industry, type: 'industry' as const });
          }
          if (profileData.preferred_niches) {
            const nichesArray = Array.isArray(profileData.preferred_niches)
              ? profileData.preferred_niches
              : typeof profileData.preferred_niches === 'string'
                ? profileData.preferred_niches.split(',').map(s => s.trim())
                : [];
            nichesArray.forEach(n => {
              if (n) tagsToSync.push({ name: n, type: 'niche' as const });
            });
          }
          if (Array.isArray(body.target_categories)) {
            body.target_categories.forEach((tc: string) => {
              if (tc) tagsToSync.push({ name: tc, type: 'target_category' as const });
            });
          }
          const uniqueTags = Array.from(
            new Map(tagsToSync.map(item => [item.name.toLowerCase() + '-' + item.type, item])).values()
          );
          if (uniqueTags.length > 0) {
            await syncEntityTags('brand_profile', actingId, uniqueTags);
          }
        } catch (e) {
          console.error("Error in brand profile tag sync:", e);
        }
      })();

      logTeamActivity(db, user, "Update Profile", `Updated brand company profile detail`);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ detail: "Server error" });
    }
  });


  router.get("/brands/team", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Not authorized", _status: 403 });

    const db = getDb();
    const actingId = getActingBrandId(user);
    const parentUser = db.users.find(u => u.user_id === actingId);
    
    // Sub members
    const members = db.users
      .filter((u) => u.parent_brand_id === actingId)
      .map(({ password_hash, ...m }) => m);

    // Add primary owner/admin to list
    if (parentUser) {
      const { password_hash, ...safeParent } = parentUser;
      members.unshift({
        ...safeParent,
        team_role: "admin",
        is_owner: true
      });
    }

    const logs = (db.team_activity_logs || [])
      .filter((l) => l.brand_user_id === actingId)
      .slice()
      .reverse();

    res.json({ members, logs });
  });


  router.post("/brands/team/add", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Not authorized", _status: 403 });

    const userTeamRole = user.team_role || "admin";
    if (userTeamRole !== "admin") {
      return res.status(403).json({ detail: "Only Administrator (Admin) can add brand team managers." });
    }

    const { name, email, password, team_role } = req.body;
    if (!name || !email || !password || !team_role) {
      return res.status(400).json({ detail: "Name, email, password, and team role are required." });
    }

    const db = getDb();
    const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ detail: "This email address is already in use." });
    }

    const actingId = getActingBrandId(user);
    const newMemberId = `user_member_${Math.random().toString(36).substring(2, 12)}`;
    
    const newMember = {
      user_id: newMemberId,
      email: email.toLowerCase(),
      name,
      password_hash: "mock_hash_" + password,
      role: "brand",
      picture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
      auth_method: "email",
      created_at: getIsoNow(),
      onboarded: true,
      parent_brand_id: actingId,
      team_role,
    };

    db.users.push(newMember);
    
    logTeamActivity(db, user, "Add Team Member", `Added team member '${name}' with role '${team_role}'`);
    saveDb(db);

    res.json({ ok: true, member: { user_id: newMemberId, name, email, team_role } });
  });

  router.post("/brand/kyc/submit", handleBrandKycSubmit);
  router.get("/brands/me", handleGetBrandsMe);
  router.get("/brand/me", handleGetBrandsMe);
  router.get("/brand/profile", handleGetBrandsMe);
}
