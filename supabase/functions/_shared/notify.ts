// Sends alert emails to the super admin's Gmail via the Gmail connector.
export const SUPER_ADMIN_ALERT_EMAIL = "samzygold3@gmail.com";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendSuperAdminAlert(
  subject: string,
  lines: Record<string, string | number | null | undefined>,
) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gmailKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
  if (!lovableKey || !gmailKey) throw new Error("Email alert credentials missing");

  const rows = Object.entries(lines)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555"><b>${esc(k)}</b></td><td>${esc(String(v))}</td></tr>`)
    .join("");
  const html = `<div style="font-family:Arial,sans-serif"><h2 style="color:#1d4ed8">${esc(subject)}</h2><table>${rows}</table><p style="color:#888;font-size:12px">CBT Portal alert • ${new Date().toUTCString()}</p></div>`;

  const raw = b64([
    `To: ${SUPER_ADMIN_ALERT_EMAIL}`,
    `Subject: ${header(`[CBT Alert] ${subject}`)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed [${res.status}]: ${await res.text()}`);
}
