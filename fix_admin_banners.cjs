const fs = require('fs');
const file = 'backend/admin_content_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const replacement = `  // Helper to map DB row to Admin UI format
  const mapDbToAdminBanner = (b: any) => ({
    id: b.id,
    type: b.target_dashboard === 'all' ? 'Common' : (b.target_dashboard === 'brand' ? 'Brand' : 'Influencer'),
    placement: 'Dashboard Hero Carousel', // default for now
    link: b.link_url || "",
    status: b.active ? "Live" : "Draft",
    imgUrl: b.image_url,
    start_date: b.start_date,
    end_date: b.end_date,
    created_at: b.created_at,
    created_by: b.created_by
  });

  router.get("/admin/banners", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== "admin" && user.team_role !== "admin" && user.team_role !== "sub_admin")) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    
    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase).from('banners').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          return res.json(data.map(mapDbToAdminBanner));
        }
      } catch (e) { console.error("Error fetching admin banners from Supabase:", e); }
    }
    
    const db = getDb();
    res.json(db.banners || []);
  });

  router.post("/admin/banners", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== "admin" && user.team_role !== "admin" && user.team_role !== "sub_admin")) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const { type, placement, link, status, imgUrl, start_date, end_date } = req.body || {};
    if (!imgUrl) return res.status(400).json({ error: "imgUrl is required" });

    const newBanner = {
      id: crypto.randomUUID(),
      target_dashboard: type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'influencer'),
      link_url: link || null,
      active: status === 'Live',
      image_url: imgUrl,
      start_date: start_date || null,
      end_date: end_date || null,
      created_at: getIsoNow(),
      created_by: user.user_id || user.id
    };

    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase).from('banners').insert(newBanner).select();
        if (!error && data && data[0]) {
          return res.json(mapDbToAdminBanner(data[0]));
        } else {
          console.error("Supabase insert banner error:", error);
        }
      } catch (e) { console.error("Exception inserting banner:", e); }
    }

    const db = getDb();
    db.banners = db.banners || [];
    const localBanner = {
      id: newBanner.id,
      type: type || "Influencer",
      placement: placement || "Dashboard Hero Carousel",
      link: link || "",
      status: status || "Live",
      imgUrl,
      start_date: start_date || null,
      end_date: end_date || null,
      created_at: newBanner.created_at,
      created_by: newBanner.created_by
    };
    db.banners.push(localBanner);
    saveDb(db);
    res.json(localBanner);
  });

  router.put("/admin/banners/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== "admin" && user.team_role !== "admin" && user.team_role !== "sub_admin")) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const { id } = req.params;
    const { type, placement, link, status, imgUrl, start_date, end_date } = req.body || {};

    let updateData: any = {};
    if (type !== undefined) updateData.target_dashboard = type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'influencer');
    if (link !== undefined) updateData.link_url = link || null;
    if (status !== undefined) updateData.active = status === 'Live';
    if (imgUrl !== undefined) updateData.image_url = imgUrl;
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;

    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase).from('banners').update(updateData).eq('id', id).select();
        if (!error && data && data[0]) {
          return res.json(mapDbToAdminBanner(data[0]));
        }
      } catch (e) { console.error("Exception updating banner:", e); }
    }

    const db = getDb();
    db.banners = db.banners || [];
    const banner = db.banners.find((b: any) => b.id === id);
    if (!banner) return res.status(404).json({ error: "Banner not found" });

    if (type !== undefined) banner.type = type;
    if (placement !== undefined) banner.placement = placement;
    if (link !== undefined) banner.link = link;
    if (status !== undefined) banner.status = status;
    if (imgUrl !== undefined) banner.imgUrl = imgUrl;
    if (start_date !== undefined) banner.start_date = start_date;
    if (end_date !== undefined) banner.end_date = end_date;

    saveDb(db);
    res.json(banner);
  });

  router.delete("/admin/banners/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== "admin" && user.team_role !== "admin" && user.team_role !== "sub_admin")) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const { id } = req.params;

    if (privilegedSupabase || supabase) {
      try {
        await (privilegedSupabase || supabase).from('banners').delete().eq('id', id);
      } catch (e) { console.error("Exception deleting banner:", e); }
    }

    const db = getDb();
    db.banners = db.banners || [];
    const before = db.banners.length;
    db.banners = db.banners.filter((b: any) => b.id !== id);
    if (db.banners.length !== before) {
      saveDb(db);
    }
    res.json({ ok: true });
  });`;

// Regex replacement
const oldRegex = /  router\.get\("\/admin\/banners", async \(req, res\) => {[\s\S]*?router\.delete\("\/admin\/banners\/:id", async \(req, res\) => {[\s\S]*?res\.json\(\{ ok: true \}\);\n  \}\);/m;
if(oldRegex.test(code)) {
    code = code.replace(oldRegex, replacement);
    fs.writeFileSync(file, code);
    console.log("Successfully replaced banner routes in backend/admin_content_routes.ts");
} else {
    console.error("Could not match the old routes regex in backend/admin_content_routes.ts");
}
