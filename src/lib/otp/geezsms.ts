import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

import { GEEZSMS_CONFIG, OTP_CONFIG } from './config';

/** Thrown when GeezSMS rejects or fails a send. `transient` maps to 503 (retryable). */
export class SmsSendError extends Error {
  transient: boolean;
  /** GeezSMS's raw response body, already code-redacted — safe to log. */
  responseBody: string | null;
  constructor(message: string, transient: boolean, responseBody: string | null = null) {
    super(message);
    this.name = 'SmsSendError';
    this.transient = transient;
    this.responseBody = responseBody;
  }
}

/**
 * What GeezSMS told us at submit time. `messageId` is the dashboard's `ID` column —
 * log it so a `requestId` in our logs can be matched against a row there.
 *
 * IMPORTANT: `error: false` is an *acceptance* ack, not a delivery receipt. GeezSMS
 * assigns the real outcome (Sent / Failed) later, once the operator responds, and we
 * have no callback for it — so a send we logged as `otp_sent` can still show `Failed`
 * on the dashboard.
 */
export interface SmsSendResult {
  messageId: string | null;
  /** Code-redacted response body, truncated for logging. */
  responseBody: string;
  /** 1 = sent first try, 2 = the transient retry succeeded. */
  attempts: number;
}

const MAX_LOGGED_BODY = 500;

/**
 * Strip the OTP from a GeezSMS response before it reaches a log line — the response
 * sometimes echoes the submitted message, which contains the code (see log.ts: the
 * plaintext code must never be logged). Also truncates.
 */
export function redactForLog(text: string, code?: string): string {
  // Belt and braces for the case where `code` wasn't passed: mask standalone runs of
  // exactly OTP-length digits. Deliberately narrow — a wider net ate `api_log_id`, the
  // year out of timestamps and the digits of hex ids like "1125daec", which is most of
  // what makes the line worth logging. The boundary is alphanumeric for the same reason.
  const n = OTP_CONFIG.length;
  const out = (code ? text.split(code).join('******') : text).replace(
    new RegExp(`(?<![0-9A-Za-z])\\d{${n}}(?![0-9A-Za-z])`, 'g'),
    '******',
  );
  return out.length > MAX_LOGGED_BODY ? `${out.slice(0, MAX_LOGGED_BODY)}…` : out;
}

/** Pull the message id out of a GeezSMS success body, whatever shape it arrives in. */
function extractMessageId(data: unknown): string | null {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  const nested = (d.data ?? {}) as Record<string, unknown>;
  // `api_log_id` is what GeezSMS actually returns on the plain-send endpoint.
  const candidates = [
    d.id,
    d.msg_id,
    d.message_id,
    d.sms_id,
    d.api_log_id,
    nested.id,
    nested.api_log_id,
    nested.msg_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
    if (typeof c === 'number') return String(c);
  }
  return null;
}

/**
 * POST a url-encoded form body using Node's raw http(s) module.
 *
 * We deliberately avoid the global `fetch`: Next.js patches it inside route handlers,
 * and its instrumented version corrupts this request so GeezSMS can't parse it and
 * returns a generic "GeezSMS Backend is running." health response (no SMS sent).
 */
function postForm(urlStr: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const requestFn = url.protocol === 'http:' ? httpRequest : httpsRequest;
    const req = requestFn(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send a plain SMS via GeezSMS `POST /api/v1/sms/send` (url-encoded: token, phone, msg).
 * Success is signalled by `error === false` in the JSON body; anything else (invalid
 * number, insufficient balance, unrecognized request, …) is a non-transient failure.
 */
async function sendSms(phone: string, msg: string, code?: string): Promise<SmsSendResult> {
  const form = new URLSearchParams();
  form.append('token', GEEZSMS_CONFIG.token);
  form.append('phone', phone);
  form.append('msg', msg);
  if (GEEZSMS_CONFIG.shortcodeId) {
    form.append('shortcode_id', GEEZSMS_CONFIG.shortcodeId);
  }

  let res: { status: number; text: string };
  try {
    res = await postForm(GEEZSMS_CONFIG.url, form.toString());
  } catch (e) {
    throw new SmsSendError(`GeezSMS network error: ${(e as Error).message}`, true);
  }

  const body = redactForLog(res.text, code);

  if (res.status < 200 || res.status >= 300) {
    // 5xx from GeezSMS is worth one retry; 4xx is not.
    throw new SmsSendError(`GeezSMS HTTP ${res.status}`, res.status >= 500, body);
  }

  let data: { error?: boolean } | null = null;
  try {
    data = JSON.parse(res.text) as { error?: boolean };
  } catch {
    throw new SmsSendError('GeezSMS returned a non-JSON response', true, body);
  }

  // `error: false` = sent. Missing/true (incl. the "Backend is running" health
  // response for unparsed requests) = failure.
  if (data?.error !== false) {
    throw new SmsSendError('GeezSMS rejected the send', false, body);
  }

  return { messageId: extractMessageId(data), responseBody: body, attempts: 1 };
}

/**
 * Send once, retrying a single time with backoff on transient failures.
 *
 * `code` is used only to redact the OTP out of anything we log from the response —
 * it is never sent to GeezSMS separately (it is already inside `msg`).
 */
export async function sendSmsWithRetry(
  phone: string,
  msg: string,
  code?: string,
): Promise<SmsSendResult> {
  try {
    return await sendSms(phone, msg, code);
  } catch (e) {
    if (e instanceof SmsSendError && e.transient) {
      await new Promise((r) => setTimeout(r, 500));
      const result = await sendSms(phone, msg, code);
      return { ...result, attempts: 2 };
    }
    throw e;
  }
}
