const fs = require('fs');
const file = 'backend/admin_content_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const fromStr = `if (type !== undefined) updateData.target_dashboard = type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'influencer');`;
const toStr = `if (type !== undefined) updateData.target_dashboard = type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'creator');`;

if (code.includes(fromStr)) {
    code = code.replace(fromStr, toStr);
    fs.writeFileSync(file, code);
    console.log("Successfully updated updateData in admin_content_routes.ts");
} else {
    console.log("Not found.");
}
