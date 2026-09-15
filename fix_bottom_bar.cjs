const fs = require('fs');
const file = 'src/components/chat/ChatBox.jsx';
let code = fs.readFileSync(file, 'utf8');

const search = '{!isPaymentFunded ? "Make payment" : isDealCompleted ? "Deal Completed" : isLiveLinksSubmitted ? "Review Live Links" : isContentApproved ? "Waiting for Live Link" : isContentSubmitted ? "Review Content" : "Waiting for Content"}';
const replace = '{!isPaymentFunded ? "Make payment" : isDealCompleted ? "Deal Completed" : isLiveLinksSubmitted ? "Review Live Links" : isContentApproved ? "Waiting for Live Link" : isRevisionDeclined ? "Changes Declined" : isRevisionRequested ? "Waiting for changes" : isContentSubmitted ? "Review Content" : "Waiting for Content"}';

if (code.includes(search)) {
  code = code.replace(search, replace);
  fs.writeFileSync(file, code);
  console.log("Success");
} else {
  console.log("Not found");
}
