// SMS and email delivery. Without provider settings, messages are only logged
// (status LOGGED) so the system works in development.
//   SMS (pick one):  SMSPORTAL_CLIENT_ID + SMSPORTAL_SECRET   or   TWILIO_SID + TWILIO_TOKEN + TWILIO_FROM
//   Email: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM   (or a single SMTP_URL)
const e = process.env;
const e164 = p => (/^0\d{9}$/.test(p) ? "+27" + p.slice(1) : p);   // South African numbers

async function smsPortal(to, text) {
  const dest = e164(to).replace("+", "");                          // 0821234567 -> 27821234567
  const r = await fetch("https://rest.smsportal.com/v1/bulkmessages", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${e.SMSPORTAL_CLIENT_ID}:${e.SMSPORTAL_SECRET}`).toString("base64"),
      "Content-Type": "application/json", Accept: "application/json"
    },
    body: JSON.stringify({ messages: [{ content: text, destination: dest }] })
  });
  const raw = await r.text();
  let d = {}; try { d = JSON.parse(raw); } catch {}
  const faults = d.ErrorReport && d.ErrorReport.Faults;
  if (!r.ok || (faults && faults.length)) throw new Error(`SMSPortal returned ${r.status}: ${raw.slice(0, 300)}`);
  return "SENT";
}

async function twilio(to, text) {
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${e.TWILIO_SID}:${e.TWILIO_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: e164(to), From: e.TWILIO_FROM, Body: text })
  });
  if (!r.ok) {
    let d = {}; try { d = await r.json(); } catch {}
    throw new Error(`SMS provider returned ${r.status}: ${d.message || "no details"} (Twilio code ${d.code || "?"}) ${d.more_info || ""}`);
  }
  return "SENT";
}

async function sendSms(to, text) {
  if (e.SMSPORTAL_CLIENT_ID) return smsPortal(to, text);
  if (e.TWILIO_SID) return twilio(to, text);
  console.log(`[SMS -> ${to}] ${text}`); return "LOGGED";
}

let transport;
async function sendEmail(to, subject, text) {
  if (!e.SMTP_URL && !e.SMTP_HOST) { console.log(`[EMAIL -> ${to}] ${text}`); return "LOGGED"; }
  transport ||= require("nodemailer").createTransport(e.SMTP_URL || {
    host: e.SMTP_HOST, port: +(e.SMTP_PORT || 465), secure: +(e.SMTP_PORT || 465) === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS }
  });
  await transport.sendMail({ from: e.MAIL_FROM || e.SMTP_USER || "no-reply@thulamela.gov.za", to, subject, text });
  return "SENT";
}
module.exports = { sendSms, sendEmail };