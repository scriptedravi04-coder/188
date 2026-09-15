const fs = require('fs');
const file = 'src/components/dashboard/BrandDashboard.jsx';
let code = fs.readFileSync(file, 'utf8');

const replaceFrom = `      // Fetch active banners from API (matches CreatorDashboard logic)
      try {
        const { data: bannersData } = await api.get('banners').catch(() => ({ data: [] }));
        if (mounted && Array.isArray(bannersData)) {
          setBanners(bannersData);
        } else if (mounted) {
          setBanners([]);
        }
      } catch (bannerErr) {
        console.warn("Failed to fetch banners via API:", bannerErr);
        if (mounted) setBanners([]);
      }`;

const replaceTo = `      // Fetch active banners from Supabase public.banners table
      try {
        const { data: bannersDb, error: bannersErr } = await supabase
          .from('banners')
          .select('*')
          .eq('active', true);

        if (!bannersErr && bannersDb && Array.isArray(bannersDb)) {
          const now = new Date();
          const validBanners = bannersDb.filter(b => {
            const target = (b.target_dashboard || '').toLowerCase();
            const matchesTarget = target === 'brand' || target === 'all' || target === 'both';
            if (!matchesTarget) return false;

            if (b.active === false) return false;

            if (b.start_date) {
              const startDate = new Date(b.start_date);
              if (startDate > now) return false;
            }

            if (b.end_date) {
              const endDate = new Date(b.end_date);
              if (typeof b.end_date === 'string' && b.end_date.length === 10) {
                endDate.setHours(23, 59, 59, 999);
              }
              if (endDate < now) return false;
            }

            return true;
          });

          if (mounted) setBanners(validBanners);
        } else {
          if (mounted) setBanners([]);
        }
      } catch (bannerErr) {
        console.warn("Failed to query public.banners from Supabase:", bannerErr);
        if (mounted) setBanners([]);
      }`;

if(code.includes(replaceFrom)) {
    code = code.replace(replaceFrom, replaceTo);
    fs.writeFileSync(file, code);
    console.log("Successfully reverted banner fetch in BrandDashboard.jsx");
} else {
    console.log("Could not find the replaceFrom block.");
}
