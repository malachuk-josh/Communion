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
  html: string
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
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
  if (lang === "es") {
    return {
      subject: `${inviterName} te invita a ${churchName} en Communion`,
      html: shell(`
        <p>¡Gracia y paz! <strong>${inviterName}</strong> te invita a unirte a
        <strong>${churchName}</strong> en Communion, para leer la Escritura y adorar juntos.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${url}" style="background:#c98f2e;color:#221604;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Aceptar invitación</a>
        </p>
        <p style="font-size:12px;color:#8a7a5c">Este enlace expira en 7 días.</p>`),
    };
  }
  return {
    subject: `${inviterName} invites you to ${churchName} on Communion`,
    html: shell(`
      <p>Grace and peace! <strong>${inviterName}</strong> is inviting you to join
      <strong>${churchName}</strong> on Communion, to read Scripture and worship together.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${url}" style="background:#c98f2e;color:#221604;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Accept your invite</a>
      </p>
      <p style="font-size:12px;color:#8a7a5c">This link expires in 7 days.</p>`),
  };
}

export function reminderEmail(
  churchName: string,
  title: string,
  whenUtc: string,
  meetingUrl?: string
): { subject: string; html: string } {
  return {
    subject: `Reminder: ${title} — ${churchName}`,
    html: shell(`
      <p><strong>${title}</strong> with <strong>${churchName}</strong> is coming up.</p>
      <p>${whenUtc}</p>
      ${meetingUrl ? `<p style="text-align:center;margin:24px 0"><a href="${meetingUrl}" style="background:#c98f2e;color:#221604;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">Join the gathering</a></p>` : ""}
      <p style="font-size:13px;color:#8a7a5c">Recordatorio: <strong>${title}</strong> con ${churchName} se acerca.</p>`),
  };
}
