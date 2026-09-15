const fs = require('fs');
const file = 'backend/chat_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `      console.error("[POST /chat/v2/threads/:threadId/submit-review] Error:", e);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });`;

const firstIndex = code.indexOf(targetStr);
if (firstIndex !== -1) {
    code = code.substring(0, firstIndex + targetStr.length) + '\n}\n';
    fs.writeFileSync(file, code);
}
