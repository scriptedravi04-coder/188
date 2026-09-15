const fs = require('fs');
const file = 'backend/chat_routes.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace the previous block we added
const searchBlock = `  router.post("/chat/v2/threads/:threadId/submit-review", async (req, res) => {`;
if (code.includes(searchBlock)) {
  const start = code.indexOf(searchBlock);
  const end = code.indexOf('});', start) + 3;
  code = code.substring(0, start) + code.substring(end + 1);
}

const routeCode = `
  router.post("/chat/v2/threads/:threadId/submit-review", async (req, res) => {
    // Just accept the review and return success
    try {
      res.json({ success: true });
    } catch (e) {
      console.error("[POST /chat/v2/threads/:threadId/submit-review] Error:", e);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
`;

const lastIndex = code.lastIndexOf('}');
code = code.substring(0, lastIndex) + routeCode + '}\n';
fs.writeFileSync(file, code);
