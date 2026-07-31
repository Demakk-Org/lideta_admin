import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

import { GEEZSMS_CONFIG } from './config';

/** Thrown when GeezSMS rejects or fails a send. `transient` maps to 503 (retryable). */
export class SmsSendError extends Error {
  transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.name = 'SmsSendError';
    this.transient = transient;
  }
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
async function sendSms(phone: string, msg: string): Promise<void> {
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

  if (res.status < 200 || res.status >= 300) {
    // 5xx from GeezSMS is worth one retry; 4xx is not.
    throw new SmsSendError(`GeezSMS HTTP ${res.status}`, res.status >= 500);
  }

  let data: { error?: boolean } | null = null;
  try {
    data = JSON.parse(res.text) as { error?: boolean };
  } catch {
    throw new SmsSendError('GeezSMS returned a non-JSON response', true);
  }

  // `error: false` = sent. Missing/true (incl. the "Backend is running" health
  // response for unparsed requests) = failure.
  if (data?.error !== false) {
    throw new SmsSendError(`GeezSMS send failed: ${res.text}`, false);
  }
}

/** Send once, retrying a single time with backoff on transient failures. */
export async function sendSmsWithRetry(phone: string, msg: string): Promise<void> {
  try {
    await sendSms(phone, msg);
  } catch (e) {
    if (e instanceof SmsSendError && e.transient) {
      await new Promise((r) => setTimeout(r, 500));
      await sendSms(phone, msg);
      return;
    }
    throw e;
  }
}
