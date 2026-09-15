const fs = require('fs');
const file = 'backend/chat_routes.ts';
let code = fs.readFileSync(file, 'utf8');

// Strip all submit-review blocks
while (code.includes('router.post("/chat/v2/threads/:threadId/submit-review"')) {
  const start = code.indexOf('router.post("/chat/v2/threads/:threadId/submit-review"');
  let end = code.indexOf('});', start) + 3;
  code = code.substring(0, start) + code.substring(end);
}

const routeCode = `
  router.post("/chat/v2/threads/:threadId/submit-review", async (req, res) => {
    try {
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
`;

const lastIndex = code.lastIndexOf('}');
code = code.substring(0, lastIndex) + routeCode + '}\n';
fs.writeFileSync(file, code);
