import { Resend } from "resend";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env" });
try {
  const envJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "env.json"), "utf-8"));
  for (const key in envJson) {
    if (!process.env[key]) {
      process.env[key] = envJson[key];
    }
  }
} catch (e) {
  // Ignore
}

const resend = new Resend(process.env.RESEND_API_KEY);

function getValidFromEmail(from?: string): string {
  if (from && typeof from === 'string' && from.includes('@') && !from.startsWith('re_')) {
    return from.trim();
  }
  const envFrom = process.env.RESEND_FROM_EMAIL;
  if (envFrom && typeof envFrom === 'string' && envFrom.includes('@') && !envFrom.startsWith('re_')) {
    return envFrom.trim();
  }
  return 'Ybex <noreply@ybexmedia.in>';
}

function buildEmailHtml({ title, greeting, paragraphs, button, signatureHtml }: any) {
  return `<div style="background-color: #f4f5f7; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';">
  <div style="max-width: 600px; margin: 0 auto;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="margin: 0; color: #374151; font-weight: 700; font-size: 22px; letter-spacing: -0.5px;">Ybex</h2>
    </div>
    
    <div style="background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; color: #4b5563; font-size: 15px; line-height: 1.6;">
      ${title ? `<h3 style="color: #111827; margin-top: 0; margin-bottom: 24px; font-size: 18px; font-weight: 600;">${title}</h3>` : ''}
      
      ${greeting ? `<p style="margin-top: 0; margin-bottom: 20px;">${greeting}</p>` : ''}
      
      ${paragraphs.map((p: string) => `<p style="margin-top: 0; margin-bottom: 20px;">${p}</p>`).join('')}

      ${button ? `<div style="margin-top: 30px; margin-bottom: 30px;"><a href="${button.link}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">${button.text}</a></div>` : ''}

      ${signatureHtml ? signatureHtml : `
        <div style="margin-top: 30px; padding-top: 20px;">
          <p style="margin: 0;">Cheers,</p>
          <p style="margin: 0; margin-top: 4px; font-weight: 600; color: #111827;">Team Ybex</p>
        </div>
      `}
    </div>
    
    <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} Ybex. All rights reserved.</p>
    </div>
  </div>
</div>`;
}

async function sendEmailForRole(role: string, targetEmail: string) {
  let paragraphs: string[] = [];

  if (role.toLowerCase() === 'brand') {
    paragraphs.push(`I built Ybex with one simple thought: to make influencer marketing simpler, more transparent, and genuinely valuable for brands.`);
    paragraphs.push(`My promise to you is simple: access to the right creators, transparent collaborations, and a platform that helps you build campaigns without unnecessary middlemen or complications.`);
    paragraphs.push(`If you ever have an issue, an idea, or simply want to share something with me, just reply to this email. I personally read every message.`);
    paragraphs.push(`Ybex is just getting started, and I'm really glad to have you here.`);
  } else if (role.toLowerCase() === 'agency') {
    paragraphs.push(`I started Ybex with one simple thought: to make influencer marketing easier for agencies and more valuable for their clients.`);
    paragraphs.push(`Whether you're managing multiple campaigns, looking for the right creators, or simply trying to get things done without the usual back-and-forth, Ybex is built to make that process smoother.`);
    paragraphs.push(`And if you ever have an idea, an issue, or simply want to share something with me, just reply to this email. I personally read every message.`);
    paragraphs.push(`Ybex is just getting started, and I'm genuinely glad to have you with us.`);
  } else {
    // Creator
    paragraphs.push(`I built Ybex with one simple thought: to create a space where your work is valued, your opportunities are genuine, and you always feel secure while working with brands.`);
    paragraphs.push(`My promise to you is simple: direct access to premium brands, zero middlemen eating into your hard-earned money, and a platform that truly respects your creative journey.`);
    paragraphs.push(`And if you ever have an issue, an idea, or simply want to share something with me, just reply to this email. I personally read these messages and will always try my best to get back to you.`);
    paragraphs.push(`Ybex is just getting started, and I'm really glad you're a part of it.`);
  }

  const signatureHtml = `
    <div style="margin-top: 32px; padding-top: 0;">
      <div style="display: flex; align-items: center;">
        <img src="https://i.ibb.co/j9vzxqbq/profile.jpg" alt="Ravi" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 14px; object-fit: cover;" />
        <div>
          <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111827;">Ravi</p>
          <p style="margin: 0; margin-top: 2px; font-size: 14px; color: #6b7280;">Founder, Ybex</p>
        </div>
      </div>
    </div>
  `;

  const welcomeHtml = buildEmailHtml({
    greeting: `Hey,`,
    paragraphs,
    signatureHtml,
    button: null
  });

  const subject = `Wanted to personally reach out`;
  
  try {
    const res = await resend.emails.send({
      from: getValidFromEmail(),
      to: targetEmail,
      subject: subject,
      html: welcomeHtml
    });
    console.log(`Sent ${role} email to ${targetEmail}`, res);
  } catch (err) {
    console.error(`Failed to send ${role} email`, err);
  }
}

async function main() {
  const target = "commonuseforpro@gmail.com";
  
  await sendEmailForRole("creator", target);
  await sendEmailForRole("brand", target);
  await sendEmailForRole("agency", target);
}

main().catch(console.error);
