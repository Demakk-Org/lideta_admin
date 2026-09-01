import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import Logger from "@/lib/utils/logger";

const COLLECTION_NAME = "push_tokens";

export class AuthError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

/**
 * A stable, non-reversible handle for an FCM/APNs token, safe to log.
 *
 * The raw token must never be logged: anyone holding it can push to that device.
 * The tail is enough to answer the questions logs are actually read for — "is the
 * app still sending the same token?", "does this row match the token that failed
 * to deliver?" — without putting a working credential in the log stream.
 */
export function tokenFingerprint(token: string | null | undefined): string | null {
  if (!token) return null;
  return `len=${token.length}:…${token.slice(-8)}`;
}

/** Correlates every line of one request, and times it. */
export function startRequestLog(route: string) {
  const reqId = crypto.randomUUID();
  const startedAt = Date.now();
  const base = () => ({ reqId, ms: Date.now() - startedAt });
  return {
    info: (step: string, data?: Record<string, unknown>) =>
      Logger.info(step, route, { ...base(), ...data }),
    warn: (step: string, data?: Record<string, unknown>) =>
      Logger.warn(step, route, { ...base(), ...data }),
    error: (step: string, data?: Record<string, unknown>) =>
      Logger.error(step, route, { ...base(), ...data }),
  };
}

export type RequestLog = ReturnType<typeof startRequestLog>;

export async function authenticateRequest(
  req: NextRequest,
  log?: RequestLog,
): Promise<DecodedIdToken> {
  log?.info("auth_start", { hasCookieHeader: Boolean(req.headers.get("cookie")) });
  const token = req.cookies.get("token")?.value;
  if (!token) {
    // The single most common cause of a 401 here: the app sent no `token` cookie
    // at all (not signed in yet, or the cookie was never set on this origin).
    log?.warn("auth_missing_cookie", {
      cookieNames: req.cookies.getAll().map((c) => c.name),
    });
    throw new AuthError(401, "Missing authentication token");
  }

  try {
    log?.info("auth_verifying", { tokenFingerprint: tokenFingerprint(token) });
    const decoded = await adminAuth.verifyIdToken(token);
    log?.info("auth_ok", {
      uid: decoded.uid,
      email: decoded.email ?? null,
      signInProvider: decoded.firebase?.sign_in_provider ?? null,
      authTimeIso: new Date(decoded.auth_time * 1000).toISOString(),
      expIso: new Date(decoded.exp * 1000).toISOString(),
    });
    return decoded;
  } catch (error) {
    // `auth/id-token-expired` vs `auth/argument-error` vs a project mismatch are
    // three completely different client bugs; without the code they all read as
    // "Invalid authentication token". Never log the token itself.
    log?.warn("auth_token_rejected", {
      firebaseCode: (error as { code?: string })?.code ?? null,
      error: error instanceof Error ? error.message : "unknown",
      tokenFingerprint: tokenFingerprint(token),
    });
    throw new AuthError(401, "Invalid authentication token");
  }
}

export const pushTokensCollection = adminDb.collection(COLLECTION_NAME);

export function buildDocId(userId: string, deviceId: string): string {
  return `${userId}__${deviceId}`;
}
