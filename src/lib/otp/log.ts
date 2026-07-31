// Small structured logger for the OTP endpoints. Every line carries the endpoint,
// a per-request id, and an elapsed-ms field so failures are traceable end-to-end.
//
// Safe to log (per spec §9 audit requirements): phone number, purpose, result, uid.
// NEVER log: the OTP code (plaintext or hash is fine but pointless), the app secret,
// the Firebase idToken, or the minted customToken.

type Level = 'info' | 'warn' | 'error';

export interface OtpLogger {
  info: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
  /** Milliseconds since this logger was created. */
  elapsedMs: () => number;
}

export function makeOtpLogger(endpoint: string, reqId: string): OtpLogger {
  const startedAt = Date.now();

  const emit = (level: Level, event: string, data?: Record<string, unknown>) => {
    const payload = { reqId, ms: Date.now() - startedAt, ...(data ?? {}) };
    const msg = `[${endpoint}] ${event}`;
    if (level === 'error') console.error(msg, payload);
    else if (level === 'warn') console.warn(msg, payload);
    else console.info(msg, payload);
  };

  return {
    info: (event, data) => emit('info', event, data),
    warn: (event, data) => emit('warn', event, data),
    error: (event, data) => emit('error', event, data),
    elapsedMs: () => Date.now() - startedAt,
  };
}
