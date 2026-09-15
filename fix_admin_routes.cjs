const fs = require('fs');
const file = 'backend/admin_content_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const fromStr = `target_dashboard: type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'influencer')`;
const toStr = `target_dashboard: type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'creator')`;

code = code.replace(fromStr, toStr);

fs.writeFileSync(file, code);
console.log("Successfully updated admin_content_routes.ts");
