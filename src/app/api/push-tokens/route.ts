import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  AuthError,
  authenticateRequest,
  pushTokensCollection,
  startRequestLog,
  tokenFingerprint,
  type RequestLog,
} from "./helpers";

type PushTokenPayload = {
  userId: string;
  fcmToken: string;
  apnsToken?: string;
  platform: string;
  deviceId: string;
  appVersion: string;
};

const SUPPORTED_PLATFORMS = new Set(["ios", "android", "web"]);
const REQUIRED_FIELDS = [
  "userId",
  "fcmToken",
  "platform",
  "deviceId",
  "appVersion",
] as const;

/**
 * Validate and, on failure, say exactly what was wrong.
 *
 * A bare "Invalid payload" is undebuggable from the app side — the client sees one
 * opaque 400 whether it forgot `appVersion` or sent `platform: "Android"`. The
 * returned reason goes to the log (not the response, which stays generic).
 */
function validatePayload(
  payload: Partial<PushTokenPayload>,
  log?: RequestLog,
): { ok: true } | { ok: false; reason: string } {
  log?.info("validate_start", { fields: payload ? Object.keys(payload) : [] });
  if (!payload) return { ok: false, reason: "body_empty" };

  const missing = REQUIRED_FIELDS.filter((f) => {
    const v = payload[f];
    return typeof v !== "string" || !v.trim();
  });
  if (missing.length) {
    return { ok: false, reason: `missing_or_blank: ${missing.join(", ")}` };
  }

  if (!SUPPORTED_PLATFORMS.has(payload.platform!.toLowerCase())) {
    return { ok: false, reason: `unsupported_platform: ${payload.platform}` };
  }
  if (payload.apnsToken !== undefined && typeof payload.apnsToken !== "string") {
    return { ok: false, reason: `apnsToken_not_a_string: ${typeof payload.apnsToken}` };
  }
  log?.info("validate_ok", {
    platform: payload.platform,
    hasApnsToken: Boolean(payload.apnsToken),
  });
  return { ok: true };
}

function docId(userId: string, deviceId: string) {
  return `${userId}__${deviceId}`;
}

export async function POST(req: NextRequest) {
  const log = startRequestLog("[pushTokensApi] POST");
  log.info("request_start", {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  try {
    const decodedUser = await authenticateRequest(req, log);

    let body: Partial<PushTokenPayload>;
    try {
      body = (await req.json()) as Partial<PushTokenPayload>;
    } catch (e) {
      log.warn("invalid_json", { error: (e as Error).message });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Logged before validation so a rejected request still shows what arrived.
    log.info("incoming", {
      uid: decodedUser.uid,
      userId: body.userId ?? null,
      deviceId: body.deviceId ?? null,
      platform: body.platform ?? null,
      appVersion: body.appVersion ?? null,
      fcmToken: tokenFingerprint(body.fcmToken),
      apnsToken: tokenFingerprint(body.apnsToken),
    });

    const valid = validatePayload(body, log);
    if (!valid.ok) {
      log.warn("invalid_payload", { reason: valid.reason });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    log.info("authz_start", { tokenUid: decodedUser.uid, bodyUserId: body.userId });
    if (decodedUser.uid !== body.userId) {
      // Usually a stale session: the app switched accounts but reused the token
      // cookie from the previous one.
      log.warn("forbidden_uid_mismatch", {
        tokenUid: decodedUser.uid,
        bodyUserId: body.userId,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    log.info("authz_ok", { uid: decodedUser.uid });

    const normalizedPlatform = body.platform!.toLowerCase();
    const id = docId(body.userId!, body.deviceId!);
    log.info("firestore_write_start", {
      collection: "push_tokens",
      docId: id,
      platform: normalizedPlatform,
      merge: true,
    });
    const docRef = pushTokensCollection.doc(id);
    const writeResult = await docRef.set(
      {
        userId: body.userId,
        deviceId: body.deviceId,
        platform: normalizedPlatform,
        fcmToken: body.fcmToken,
        apnsToken: body.apnsToken ?? null,
        appVersion: body.appVersion,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    log.info("upserted", {
      uid: decodedUser.uid,
      docId: id,
      platform: normalizedPlatform,
      appVersion: body.appVersion,
      fcmToken: tokenFingerprint(body.fcmToken),
      writeTime: writeResult.writeTime.toDate().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    log.error("failed", {
      status,
      firebaseCode: (error as { code?: string })?.code ?? null,
      error: error instanceof Error ? error.message : "unknown",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Failed to upsert push token" },
      { status },
    );
  }
}
