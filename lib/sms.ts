// Transactional SMS via Brevo — same account and API key as email.
// Dormant until the Brevo account has SMS credits and a registered sender;
// sends simply fail closed (return false) until then, so the reminder cron
// and Settings UI can ship ahead of activation.

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

/**
 * SMS goes live only when a registered sender number exists
 * (BREVO_SMS_SENDER) — US carriers drop alphanumeric senders, so until a
 * number is registered every send would be skipped. Preferences collected
 * in Settings are stored regardless and activate the moment this is set.
 */
export function smsEnabled(): boolean {
  return !!(
    cleanEnv(process.env.BREVO_API_KEY) && cleanEnv(process.env.BREVO_SMS_SENDER)
  );
}

/** E.164: +15551234567 */
export function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export async function sendSms(to: string, content: string): Promise<boolean> {
  const apiKey = cleanEnv(process.env.BREVO_API_KEY);
  const sender = cleanEnv(process.env.BREVO_SMS_SENDER);
  if (!apiKey || !sender || !isValidPhone(to)) return false;
  try {
    const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        type: "transactional",
        unicodeEnabled: false,
        sender,
        recipient: to,
        content: content.slice(0, 320),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
