const fs = require('fs');
const path = 'src/components/admin/BannerManager.jsx';
let content = fs.readFileSync(path, 'utf8');

const modalStr = `
       {bannerToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <div className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-6 text-center">
                <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Trash2 size={24} />
                </div>
                <h3 className="text-lg font-bold mb-2">Delete Banner?</h3>
                <p className="text-[var(--text-secondary)] text-sm mb-6">Are you sure you want to delete this banner? This action cannot be undone.</p>
                <div className="flex gap-3">
                   <button onClick={() => setBannerToDelete(null)} className="flex-1 py-2 rounded-xl font-medium bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-colors">Cancel</button>
                   <button onClick={handleDelete} className="flex-1 py-2 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
                </div>
             </div>
          </div>
       )}

       {showUploadModal && (
`;

content = content.replace('{showUploadModal && (', modalStr.trim());
fs.writeFileSync(path, content);
