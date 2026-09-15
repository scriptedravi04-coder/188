const fs = require('fs');
const file = 'src/components/dashboard/BrandDashboard.jsx';
let code = fs.readFileSync(file, 'utf8');

const replaceFromLayout = `{/* Left: Auto-rotating brand marketing carousel (hidden completely if zero active banners) */}
        {banners.length > 0 && (
          <div className="lg:col-span-3">
            <div className="bg-[var(--bg-card)] rounded-[16px] lg:rounded-[24px] relative overflow-hidden flex flex-col justify-center border border-[var(--border-default)] h-[105px] md:h-[200px] lg:h-[280px] w-full group shadow-md">
               {banners.map((banner, idx) => {`;

const replaceToLayout = `{/* Left: Auto-rotating brand marketing carousel (shows empty placeholder if zero active banners) */}
        <div className="lg:col-span-3">
          <div className="bg-[var(--bg-card)] rounded-[16px] lg:rounded-[24px] relative overflow-hidden flex flex-col justify-center border border-[var(--border-default)] h-[105px] md:h-[200px] lg:h-[280px] w-full group shadow-md">
             {banners.length === 0 ? (
               <div className="w-full h-full flex flex-col items-center justify-center bg-[#f0f0f5] text-slate-400">
                  <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs font-semibold tracking-wide uppercase">Promotions & Updates</span>
               </div>
             ) : (
               <>
               {banners.map((banner, idx) => {`;

const replaceFromLayoutEnd = `                 </div>
               )}
            </div>
          </div>
        )}

        {/* Right: Important for You brand console task loop card */}
        <div className={\`hidden sm:flex \${banners.length > 0 ? "lg:col-span-1" : "lg:col-span-4"} bg-white rounded-[20px] p-3 sm:p-6 border border-[var(--border-default)] flex-col md:h-[200px] lg:h-[280px] relative w-full\`}>`;

const replaceToLayoutEnd = `                 </div>
               )}
               </>
             )}
          </div>
        </div>

        {/* Right: Important for You brand console task loop card */}
        <div className="hidden sm:flex lg:col-span-1 bg-white rounded-[20px] p-3 sm:p-6 border border-[var(--border-default)] flex-col md:h-[200px] lg:h-[280px] relative w-full">`;

if(code.includes(replaceFromLayoutEnd)) {
    code = code.replace(replaceFromLayout, replaceToLayout);
    code = code.replace(replaceFromLayoutEnd, replaceToLayoutEnd);
    fs.writeFileSync(file, code);
    console.log("Successfully fixed BrandDashboard layout");
} else {
    console.log("Could not find block layout");
}
