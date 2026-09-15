const fs = require('fs');
const file = 'backend/chat_routes.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /if \(user\.id === thread\.creator_id\) targetId = thread\.brand_id;/,
  "if ((user.user_id || user.id) === thread.creator_id) targetId = thread.brand_id;"
);
code = code.replace(
  /else if \(user\.id === thread\.brand_id\) targetId = thread\.creator_id;/,
  "else if ((user.user_id || user.id) === thread.brand_id) targetId = thread.creator_id;"
);
code = code.replace(
  /reviewer_id: user\.id,/,
  "reviewer_id: user.user_id || user.id,"
);

fs.writeFileSync(file, code);
