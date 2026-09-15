const fs = require('fs');
const file = 'backend/chat_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const searchCode = `
    const { threadId } = req.params;
    const { rating, communication_rating, timeliness_rating, quality_rating, comment } = req.body;
`;

const replaceCode = `
  router.post("/chat/v2/threads/:threadId/submit-review", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });
    const { threadId } = req.params;
    const { rating, communication_rating, timeliness_rating, quality_rating, comment } = req.body;
`;

code = code.replace(searchCode, replaceCode);
fs.writeFileSync(file, code);
