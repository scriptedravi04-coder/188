const fs = require('fs');
const file = 'src/components/chat/ChatBox.jsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /\[\'SUBMITTED\', \'CONTENT_SUBMITTED\', \'COMPLETED\', \'APPROVED\'\]\.includes\(rawStatus\)/g,
  "['SUBMITTED', 'CONTENT_SUBMITTED', 'COMPLETED', 'APPROVED', 'IN_PROGRESS', 'ACCEPTED', 'REVISION_REQUESTED', 'CHANGES_DECLINED', 'CONTENT_APPROVED', 'LIVE_LINKS_SUBMITTED', 'LIVE_LINK_REVISION', 'LIVE_LINKS_APPROVED'].includes(rawStatus)"
);

code = code.replace(
  /\[\'SUBMITTED\', \'CONTENT_SUBMITTED\', \'COMPLETED\', \'APPROVED\'\]\.includes\(flowState\)/g,
  "['SUBMITTED', 'CONTENT_SUBMITTED', 'COMPLETED', 'APPROVED', 'IN_PROGRESS', 'ACCEPTED', 'REVISION_REQUESTED', 'CHANGES_DECLINED', 'CONTENT_APPROVED', 'LIVE_LINKS_SUBMITTED', 'LIVE_LINK_REVISION', 'LIVE_LINKS_APPROVED'].includes(flowState)"
);

fs.writeFileSync(file, code);
