import nodemailer from 'nodemailer';

// Outbound email (receipts). No-ops cleanly until SMTP_* env vars are set on Railway:
//   SMTP_HOST, SMTP_USER, SMTP_PASS  (required)
//   SMTP_PORT (default 587), SMTP_FROM (default SMTP_USER)
// Gmail works with an App Password: SMTP_HOST=smtp.gmail.com, SMTP_USER=<gmail>, SMTP_PASS=<app password>.

const HOST = (process.env.SMTP_HOST || '').trim();
const USER = (process.env.SMTP_USER || '').trim();
const PASS = (process.env.SMTP_PASS || '').trim();
const PORT = Number(process.env.SMTP_PORT || 587);
const FROM = (process.env.SMTP_FROM || USER).trim();

export const emailConfigured = () => !!(HOST && USER && PASS);

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: USER, pass: PASS },
    });
  }
  return transport;
}

export async function sendEmail({ to, subject, html }) {
  if (!emailConfigured() || !to) return false;
  try {
    await getTransport().sendMail({ from: FROM, to, subject, html });
    return true;
  } catch (e) {
    console.error('[email] send failed:', e.message);
    return false;
  }
}
