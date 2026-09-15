const fs = require('fs');
const file = 'src/components/dashboard/BrandDashboard.jsx';
let code = fs.readFileSync(file, 'utf8');

const fallbackList = `
const brandHeroBannersList = [
  {
    id: "b1",
    title: "Launch UGC Campaigns",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop",
    link: "/campaigns/create"
  },
  {
    id: "b2",
    title: "Discover Creators",
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=600&auto=format&fit=crop",
    link: "/explore"
  }
];
`;

if (!code.includes("brandHeroBannersList")) {
    code = code.replace(/const importantTasks = \[/, fallbackList + "\nconst importantTasks = [");
}

const mapReplaceFrom = `{banners.length === 0 ? (
               <div className="w-full h-full flex flex-col items-center justify-center bg-[#f0f0f5] text-slate-400">
                  <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs font-semibold tracking-wide uppercase">Promotions & Updates</span>
               </div>
             ) : (
               <>
               {banners.map((banner, idx) => {`;

const mapReplaceTo = `
               <>
               {(banners.length > 0 ? banners : brandHeroBannersList).map((banner, idx) => {`;


const displayLenReplaceFrom = `{banners.length > 1 && (`;
const displayLenReplaceTo = `{(banners.length > 0 ? banners : brandHeroBannersList).length > 1 && (`;

const mapReplaceFrom2 = `{banners.map((_, idx) => (`;
const mapReplaceTo2 = `{(banners.length > 0 ? banners : brandHeroBannersList).map((_, idx) => (`;

const useEffReplaceFrom = `  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [banners.length]);`;

const useEffReplaceTo = `  const displayBanners = banners.length > 0 ? banners : brandHeroBannersList;

  useEffect(() => {
    if (displayBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % displayBanners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [displayBanners.length]);`;

code = code.replace(mapReplaceFrom, mapReplaceTo);
code = code.replace(displayLenReplaceFrom, displayLenReplaceTo);
code = code.replace(mapReplaceFrom2, mapReplaceTo2);
code = code.replace(useEffReplaceFrom, useEffReplaceTo);

fs.writeFileSync(file, code);
console.log("Updated BrandDashboard to use fallback banners list for auto-scroll!");
