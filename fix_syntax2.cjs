const fs = require('fs');
const file = 'backend/chat_routes.ts';
let code = fs.readFileSync(file, 'utf8');

const searchCode = `      }
      res.json({ success: true });
    } catch (e) {
      console.error("[POST /chat/v2/threads/:threadId/submit-review] Error:", e);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
      } catch (e) {
      console.error("[POST /chat/v2/threads/:threadId/submit-review] Error:", e);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
  router.post("/chat/v2/threads/:threadId/submit-review", async (req, res) => {
    try {
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
}`;

const replaceCode = `      }
      res.json({ success: true });
    } catch (e) {
      console.error("[POST /chat/v2/threads/:threadId/submit-review] Error:", e);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
}`;

code = code.replace(searchCode, replaceCode);
fs.writeFileSync(file, code);
