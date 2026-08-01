// Transactional email via Brevo. Dormant until BREVO_API_KEY and
// BREVO_SENDER_EMAIL are configured (sender must be validated in Brevo);
// callers fall back gracefully while disabled — same pattern as Clerk/Upstash.

import type { Lang } from "@/lib/i18n";

function cleanEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return undefined;
  const unquoted = firstLine.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return unquoted || undefined;
}

export function emailEnabled(): boolean {
  return !!(
    cleanEnv(process.env.BREVO_API_KEY) &&
    cleanEnv(process.env.BREVO_SENDER_EMAIL)
  );
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachment?: { name: string; contentBase64: string }
): Promise<boolean> {
  const apiKey = cleanEnv(process.env.BREVO_API_KEY);
  const sender = cleanEnv(process.env.BREVO_SENDER_EMAIL);
  if (!apiKey || !sender) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Communion", email: sender },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...(attachment
          ? {
              attachment: [
                { name: attachment.name, content: attachment.contentBase64 },
              ],
            }
          : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/*
 * Names go into these templates, and names are typed by people.
 *
 * A Gathering can be called anything, and its name reaches an inbox that has
 * never heard of it — the recipient of an invitation is by definition not a
 * member yet, and has only this email to judge by. So a Gathering named
 * `</p><a href="https://not-us.example">Verify your account</a><p>` would put
 * a stranger's link inside a letter that carries our name and our styling,
 * which is the whole shape of a phishing email with none of the work.
 *
 * Mail clients are inconsistent about what markup they strip; several strip
 * scripts and keep anchors, which is exactly the part that does the damage.
 * So nothing is trusted to the client: the text is escaped here.
 */
const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * An href is a second door. Escaping keeps a value inside the attribute, but
 * inside the attribute `javascript:` and `data:` are still live in some
 * clients, so the scheme is checked rather than the punctuation. Anything not
 * plainly a web address becomes a dead link — a broken button is a far better
 * outcome than a working one that goes somewhere else.
 */
const safeUrl = (raw: string): string => {
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return esc(u.href);
  } catch {
    // not an absolute URL at all
  }
  return "#";
};

/** Subjects are one line. A name with a newline in it should not look like two. */
const oneLine = (s: string) => String(s).replace(/\s+/g, " ").trim();

const shell = (body: string) => `
<div style="background:#f7efdd;padding:32px 16px;font-family:Georgia,serif;color:#33281a">
  <div style="max-width:480px;margin:0 auto;background:#fffcf3;border:1px solid #d8c9a5;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:500">Communion</h1>
    ${body}
    <p style="font-size:12px;color:#8a7a5c;margin-top:24px;font-style:italic">
      "For where two or three are gathered together in my name, there am I in the midst of them." — Matthew 18:20
    </p>
  </div>
</div>`;

export function inviteEmail(
  lang: Lang,
  churchName: string,
  inviterName: string,
  url: string
): { subject: string; html: string } {
  const church = esc(churchName);
  const inviter = esc(inviterName);
  const href = safeUrl(url);
  if (lang === "es") {
    return {
      subject: oneLine(`${inviterName} te invita a ${churchName} en Communion`),
      html: shell(`
        <p>¡Gracia y paz! <strong>${inviter}</strong> te invita a unirte a
        <strong>${church}</strong> en Communion, para leer la Escritura y adorar juntos.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${href}" style="background:#c98f2e;color:#221604;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Aceptar invitación</a>
        </p>
        <p style="font-size:12px;color:#8a7a5c">Este enlace expira en 7 días.</p>`),
    };
  }
  return {
    subject: oneLine(`${inviterName} invites you to ${churchName} on Communion`),
    html: shell(`
      <p>Grace and peace! <strong>${inviter}</strong> is inviting you to join
      <strong>${church}</strong> on Communion, to read Scripture and worship together.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${href}" style="background:#c98f2e;color:#221604;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Accept your invite</a>
      </p>
      <p style="font-size:12px;color:#8a7a5c">This link expires in 7 days.</p>`),
  };
}

export function requestEmail(
  churchName: string,
  requesterName: string,
  url: string
): { subject: string; html: string } {
  const church = esc(churchName);
  const requester = esc(requesterName);
  return {
    subject: oneLine(`${requesterName} asked to join ${churchName}`),
    html: shell(`
      <p><strong>${requester}</strong> has asked to join
      <strong>${church}</strong> on Communion.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${safeUrl(url)}" style="background:#c98f2e;color:#221604;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Review the request</a>
      </p>
      <p style="font-size:13px;color:#8a7a5c"><strong>${requester}</strong> pidió unirse a ${church}.</p>`),
  };
}

export function reminderEmail(
  churchName: string,
  title: string,
  whenUtc: string,
  meetingUrl?: string
): { subject: string; html: string } {
  const church = esc(churchName);
  const what = esc(title);
  return {
    subject: oneLine(`Reminder: ${title} — ${churchName}`),
    html: shell(`
      <p><strong>${what}</strong> with <strong>${church}</strong> is coming up.</p>
      <p>${esc(whenUtc)}</p>
      ${meetingUrl ? `<p style="text-align:center;margin:24px 0"><a href="${safeUrl(meetingUrl)}" style="background:#c98f2e;color:#221604;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Join the gathering</a></p>` : ""}
      <p style="font-size:13px;color:#8a7a5c">Recordatorio: <strong>${what}</strong> con ${church} se acerca.</p>`),
  };
}
